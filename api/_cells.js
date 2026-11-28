// Pricing chain: text -> bits -> TON cells -> gram (nanoTON) -> TON -> AXF -> Stars.
// Cell and bit prices are the TON basechain message forward prices (config param 25):
// lump 400000, bit 26214400, cell 2621440000, all in nanoTON per 2^16.
// The exchange rates between TON, AXF and Stars are set by the operator (env), not by the chain.
const { AXF_PER_STAR } = require("./_axf");

const BITS_PER_CELL = 1016; // 127 bytes of payload per cell in snake-format text
const FWD = { lump: 400000n, bit: 26214400n, cell: 2621440000n, shift: 65536n };
const STARS_PER_TON = Number(process.env.TGRAM_STARS_PER_TON || 250);
const NANO = 1e9;

function cellsFor(text) {
  const bits = Buffer.byteLength(String(text || ""), "utf8") * 8;
  return { bits, cells: Math.max(1, Math.ceil(bits / BITS_PER_CELL)) };
}

function gramsFor(bits, cells) {
  const variable = (FWD.bit * BigInt(bits) + FWD.cell * BigInt(cells) + FWD.shift - 1n) / FWD.shift;
  return FWD.lump + variable;
}

function chain(text) {
  const { bits, cells } = cellsFor(text);
  const gram = gramsFor(bits, cells);
  const ton = Number(gram) / NANO;
  const stars = ton * STARS_PER_TON;
  const axf = stars * AXF_PER_STAR;
  return { chars: String(text || "").length, bits, cells, gram: gram.toString(), ton, axf, stars };
}

function formatChain(c) {
  return [
    `Zeichen: ${c.chars} -> ${c.bits} Bits -> ${c.cells} Cells`,
    `Gram: ${c.gram} nanoTON = ${c.ton.toFixed(6)} TON`,
    `AXF: ${c.axf.toFixed(4)} (1 Star = ${AXF_PER_STAR} AXF)`,
    `Stars: ${c.stars.toFixed(4)} (1 TON = ${STARS_PER_TON} Stars)`,
  ].join("\n");
}

module.exports = { chain, formatChain, STARS_PER_TON, BITS_PER_CELL };
