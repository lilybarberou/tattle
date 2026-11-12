import { lookup } from "node:dns/promises";
import { isIP } from "node:net";

// The AI base URL is typed by a workspace admin, and anyone can become one on
// a server with ALLOW_SIGNUP=true. Unless AI_ALLOW_PRIVATE_URLS=true, Tattle
// never calls an address inside its own machine or network with it.

const ipv4Number = (address: string) =>
	address.split(".").reduce((total, part) => total * 256 + Number(part), 0);

// Loopback, private, link-local (169.254.169.254, the cloud metadata service),
// "this network", carrier-grade NAT, benchmarking, multicast and reserved.
const IPV4_BLOCKED = (
	[
		["0.0.0.0", 8],
		["10.0.0.0", 8],
		["100.64.0.0", 10],
		["127.0.0.0", 8],
		["169.254.0.0", 16],
		["172.16.0.0", 12],
		["192.0.0.0", 24],
		["192.168.0.0", 16],
		["198.18.0.0", 15],
		["224.0.0.0", 3],
	] as const
).map(([base, bits]) => ({
	start: ipv4Number(base),
	size: 2 ** (32 - bits),
}));

const isPrivateIpv4 = (address: string) => {
	const value = ipv4Number(address);
	return IPV4_BLOCKED.some(
		({ start, size }) => value >= start && value < start + size,
	);
};

/** The 8 groups of a valid IPv6 address, a dotted IPv4 tail included. */
const ipv6Groups = (address: string): number[] => {
	let text = address.toLowerCase().replace(/%.*$/, "");
	const tail = text.slice(text.lastIndexOf(":") + 1);
	if (tail.includes(".")) {
		const value = ipv4Number(tail);
		text = `${text.slice(0, text.length - tail.length)}${Math.floor(value / 65536).toString(16)}:${(value % 65536).toString(16)}`;
	}
	const [head = "", rest] = text.split("::");
	const parse = (part: string) =>
		part ? part.split(":").map((group) => Number.parseInt(group, 16)) : [];
	const left = parse(head);
	if (rest === undefined) return left;
	const right = parse(rest);
	return [
		...left,
		...Array<number>(8 - left.length - right.length).fill(0),
		...right,
	];
};

const embeddedIpv4 = (high: number, low: number) =>
	[high >> 8, high & 255, low >> 8, low & 255].join(".");

const isPrivateIpv6 = (address: string) => {
	const g = ipv6Groups(address);
	const [g0 = 0, g1 = 0, g2 = 0, , , g5 = 0, g6 = 0, g7 = 0] = g;
	const zeroUpTo = (count: number) => g.slice(0, count).every((x) => x === 0);
	// IPv4-mapped (::ffff:a.b.c.d) and IPv4-compatible (::a.b.c.d, which
	// covers :: and ::1): judged as the IPv4 address they carry.
	if (zeroUpTo(5) && (g5 === 0xffff || g5 === 0))
		return isPrivateIpv4(embeddedIpv4(g6, g7));
	// NAT64 (64:ff9b::a.b.c.d) and 6to4 (2002:aabb:ccdd::) carry one too.
	if (g0 === 0x64 && g1 === 0xff9b) {
		if (g2 === 1) return true; // 64:ff9b:1::/48, local-use NAT64
		if (g.slice(2, 6).every((x) => x === 0))
			return isPrivateIpv4(embeddedIpv4(g6, g7));
	}
	if (g0 === 0x2002) return isPrivateIpv4(embeddedIpv4(g1, g2));
	return (
		(g0 & 0xfe00) === 0xfc00 || // fc00::/7, unique-local
		(g0 & 0xffc0) === 0xfe80 || // fe80::/10, link-local
		(g0 & 0xffc0) === 0xfec0 || // fec0::/10, old site-local
		(g0 & 0xff00) === 0xff00 // ff00::/8, multicast
	);
};

/** True for an address on the machine itself or a private network. */
export const isPrivateAddress = (address: string) => {
	const family = isIP(address);
	if (family === 4) return isPrivateIpv4(address);
	if (family === 6) return isPrivateIpv6(address);
	return true; // not an address at all: never call it
};

export type Resolver = (hostname: string) => Promise<ReadonlyArray<string>>;

const resolveAll: Resolver = async (hostname) =>
	(await lookup(hostname, { all: true, verbatim: true })).map(
		(entry) => entry.address,
	);

/**
 * "private" when the URL's host is, or resolves to, at least one private
 * address (every IPv4 and IPv6 address is checked); "unresolved" when its
 * name does not resolve.
 */
export const checkUrlHost = async (
	url: string,
	resolve: Resolver = resolveAll,
): Promise<"public" | "private" | "unresolved"> => {
	let hostname: string;
	try {
		hostname = new URL(url).hostname.replace(/^\[|\]$/g, "");
	} catch {
		return "unresolved";
	}
	let addresses: ReadonlyArray<string>;
	if (isIP(hostname)) addresses = [hostname];
	else {
		try {
			addresses = await resolve(hostname);
		} catch {
			return "unresolved";
		}
	}
	if (addresses.length === 0) return "unresolved";
	return addresses.some(isPrivateAddress) ? "private" : "public";
};
