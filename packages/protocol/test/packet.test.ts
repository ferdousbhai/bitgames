import { describe, expect, it } from "vitest";
import {
  Flags,
  FragmentAssembler,
  MessageType,
  decodePacket,
  encodePacket,
  fragmentPacket,
  fromHex,
  pad,
  signingBytes,
  toHex,
  unpad,
  type Packet,
} from "../src/index.js";

const sender = fromHex("1122334455667788");
const recipient = fromHex("a1b2c3d4e5f60708");

function basePacket(overrides: Partial<Packet> = {}): Packet {
  return {
    version: 1,
    type: MessageType.message,
    ttl: 7,
    timestamp: 0x0102030405060708n,
    senderID: sender,
    payload: new TextEncoder().encode("hi"),
    ...overrides,
  };
}

describe("encodePacket", () => {
  it("matches the BitChat v1 wire layout byte for byte", () => {
    const bytes = encodePacket(basePacket(), { padding: false })!;
    expect(toHex(bytes)).toBe(
      "01" + "02" + "07" + "0102030405060708" + "00" + "0002" + "1122334455667788" + "6869",
    );
  });

  it("writes recipient and signature flags and fields", () => {
    const signature = new Uint8Array(64).fill(0xab);
    const bytes = encodePacket(basePacket({ recipientID: recipient, signature }), { padding: false })!;
    expect(bytes[11]).toBe(Flags.hasRecipient | Flags.hasSignature);
    expect(toHex(bytes.subarray(22, 30))).toBe(toHex(recipient));
    expect(bytes.length).toBe(14 + 8 + 8 + 2 + 64);
  });

  it("uses a 4-byte length and a route for v2", () => {
    const route = [fromHex("0102030405060708"), fromHex("aabb")];
    const bytes = encodePacket(basePacket({ version: 2, route }), { padding: false })!;
    expect(bytes[11]).toBe(Flags.hasRoute);
    expect(toHex(bytes.subarray(12, 16))).toBe("00000002");
    // Route count, then hops truncated or zero-padded to 8 bytes.
    expect(toHex(bytes.subarray(24, 41))).toBe("02" + "0102030405060708" + "aabb000000000000");
  });

  it("ignores the route for v1", () => {
    const bytes = encodePacket(basePacket({ route: [sender] }), { padding: false })!;
    expect(bytes[11]! & Flags.hasRoute).toBe(0);
  });

  it("pads to the BitChat block sizes", () => {
    expect(encodePacket(basePacket())!.length).toBe(256);
    expect(encodePacket(basePacket({ payload: new Uint8Array(300).map((_, i) => i) }))!.length).toBe(512);
  });
});

describe("decodePacket", () => {
  it("round-trips padded and unpadded packets", () => {
    const original = basePacket({ recipientID: recipient, signature: new Uint8Array(64).fill(1), isRSR: true });
    for (const padding of [true, false]) {
      const decoded = decodePacket(encodePacket(original, { padding })!)!;
      expect(decoded).toEqual(original);
    }
  });

  it("compresses repetitive payloads and restores them", () => {
    const payload = new TextEncoder().encode("abc".repeat(200));
    const bytes = encodePacket(basePacket({ payload }), { padding: false })!;
    expect(bytes[11]! & Flags.isCompressed).toBe(Flags.isCompressed);
    expect(bytes.length).toBeLessThan(payload.length);
    expect(decodePacket(bytes)!.payload).toEqual(payload);
  });

  it("does not compress high-entropy payloads", () => {
    const payload = crypto.getRandomValues(new Uint8Array(500));
    const bytes = encodePacket(basePacket({ payload }), { padding: false })!;
    expect(bytes[11]! & Flags.isCompressed).toBe(0);
  });

  it("rejects truncated and malformed input", () => {
    const bytes = encodePacket(basePacket(), { padding: false })!;
    expect(decodePacket(bytes.subarray(0, bytes.length - 1))).toBeNull();
    expect(decodePacket(new Uint8Array(10))).toBeNull();
    const badVersion = bytes.slice();
    badVersion[0] = 9;
    expect(decodePacket(badVersion)).toBeNull();
  });

  it("rejects payloads above the per-type cap", () => {
    // A ping is a control packet capped at 4 KiB.
    const big = basePacket({ version: 2, type: MessageType.ping, payload: crypto.getRandomValues(new Uint8Array(5000)) });
    expect(decodePacket(encodePacket(big, { padding: false })!)).toBeNull();
  });

  it("rejects compression bombs by ratio", () => {
    const bytes = encodePacket(basePacket({ payload: new Uint8Array(1000) }), { padding: false })!;
    // Claim an original size far beyond what the compressed bytes could expand to.
    const view = new DataView(bytes.buffer, bytes.byteOffset);
    view.setUint16(22, 0xffff);
    expect(decodePacket(bytes)).toBeNull();
  });
});

describe("signingBytes", () => {
  it("ignores TTL, RSR and signature so relays do not break signatures", () => {
    const a = signingBytes(basePacket({ ttl: 7 }))!;
    const b = signingBytes(basePacket({ ttl: 2, isRSR: true, signature: new Uint8Array(64) }))!;
    expect(toHex(a)).toBe(toHex(b));
  });
});

describe("padding", () => {
  it("unpad reverses pad and leaves unpadded data alone", () => {
    const data = fromHex("0102030405");
    expect(unpad(pad(data, 32))).toEqual(data);
    const notPadded = fromHex("010203");
    expect(unpad(notPadded)).toBe(notPadded);
  });
});

describe("fragmentation", () => {
  const big = basePacket({ payload: crypto.getRandomValues(new Uint8Array(3000)), recipientID: recipient });

  it("reassembles out-of-order fragments with duplicates", () => {
    const fragments = fragmentPacket(big, { chunkSize: 400 });
    expect(fragments.length).toBeGreaterThan(1);
    const assembler = new FragmentAssembler();
    const shuffled = [...fragments].reverse();
    shuffled.splice(1, 0, shuffled[0]!);
    let result: Packet | null = null;
    for (const f of shuffled) {
      const wire = decodePacket(encodePacket(f)!)!;
      result = assembler.add(wire) ?? result;
    }
    expect(result).not.toBeNull();
    expect(result!.payload).toEqual(big.payload);
    expect(result!.ttl).toBe(0);
    expect(assembler.inFlight).toBe(0);
  });

  it("rejects a reassembly whose type differs from the fragments' claim", () => {
    const fragments = fragmentPacket(big, { chunkSize: 400 });
    for (const f of fragments) f.payload[12] = MessageType.ping;
    const assembler = new FragmentAssembler();
    expect(fragments.map((f) => assembler.add(f)).every((r) => r === null)).toBe(true);
  });

  it("expires stale assemblies", () => {
    const fragments = fragmentPacket(big, { chunkSize: 400 });
    const assembler = new FragmentAssembler({ timeoutMs: 1000 });
    assembler.add(fragments[0]!, 0);
    expect(assembler.inFlight).toBe(1);
    assembler.expire(5000);
    expect(assembler.inFlight).toBe(0);
  });

  it("evicts the oldest assembly when full", () => {
    const assembler = new FragmentAssembler({ maxInFlight: 2 });
    for (let i = 0; i < 3; i++) {
      const [first] = fragmentPacket(big, { chunkSize: 400 });
      assembler.add(first!, i);
    }
    expect(assembler.inFlight).toBe(2);
  });
});
