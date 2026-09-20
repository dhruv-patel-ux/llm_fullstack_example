const { QdrantClient } = require("@qdrant/js-client-rest");
const { GoogleGenAI } = require("@google/genai");

const qdrant = new QdrantClient({
  url: process.env.QDRANT_URL,
  apiKey: process.env.QDRANT_KEY,
});

const genai = new GoogleGenAI({ apiKey: process.env.OPENAI_KEY });

async function embed(text) {
  const res = await genai.models.embedContent({
    model: "gemini-embedding-001", // 768-dim vectors
    contents: text,
  });
  return res.embeddings[0].values;
}

// async function main() {
//   // Note: vector size changes to match Gemini's output (768, not 1536)
//   await qdrant.recreateCollection("notes", {
//     vectors: { size: 3072, distance: "Cosine" },
//   });

//   const docs = [
//     "The gold loan interest rate depends on the customer's LTV ratio.",
//     "CPV verification checks whether the customer lives at the registered address.",
//     "Sequelize migrations let you version-control database schema changes.",
//     "The cat sat lazily in the warm afternoon sun.",
//   ];

//   for (let i = 0; i < docs.length; i++) {
//     const vector = await embed(docs[i]);
//     await qdrant.upsert("notes", {
//       points: [{ id: i, vector, payload: { text: docs[i] } }],
//     });
//   }

//   const queryVector = await embed(
//     "How do we confirm someone actually lives where they said?"
//   );

//   const results = await qdrant.search("notes", {
//     vector: queryVector,
//     limit: 2,
//   });

//   results.forEach((r) => console.log(r.score.toFixed(3), "-", r.payload.text));
// }

// main();
module.exports = { embed, qdrant  };
