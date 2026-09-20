const express = require('express');
const multer = require('multer');
const fs = require('fs');
const bodyParser = require('body-parser');
const { extractText } = require("unpdf");   // pulls text out of a PDF; npm i unpdf
const OpenAI = require("openai");
const { embed, qdrant } = require('./qdrant');


const app = express();
app.use(bodyParser.json());
const upload = multer({ dest: "uploads/" });
const openai = new OpenAI({
    baseURL: "https://openrouter.ai/api/v1",   // ← point at OpenRouter
    apiKey: process.env.OPENROUTERAI_KEY,    // ← OpenRouter key, not OpenAI
});
const port = 3000;
const docs = new Map(); // docId -> full text

function chunkText(text, chunkSize = 500) {
    const words = text.split(/\s+/);
    const chunks = [];
    for (let i = 0; i < words.length; i += chunkSize) {
        chunks.push(words.slice(i, i + chunkSize).join(" "));
    }
    return chunks;
}

async function storeDocument(docId, fullText) {
    const chunks = chunkText(fullText);
    const points = [];
    for (const content of chunks) {
        const vector = await embed(content);
        points.push({ id: crypto.randomUUID(), vector, payload: { docId, content } });
    }
    return await qdrant.upsert("documents", { points });
}
app.post('/upload-file', upload.single('file'), async (req, res) => {
    try {
        const buffer = await fs.promises.readFile(req.file.path);
        const { text } = await extractText(new Uint8Array(buffer), { mergePages: true });
        const docId = crypto.randomUUID();
        docs.set(docId, text);   // ← keep the text so follow-ups can reuse it
        await storeDocument(docId, text);
        res.json({ docId, chars: text.length });

    } catch (error) {
        console.error('Error processing request:', error);
        res.status(500).json({ error: 'Internal Server Error' });
    }
})
app.post('/query', async (req, res) => {
    try {
        const { docId, question } = req.body;
        const qVector = await embed(question);

        // 2) search Qdrant for the 5 nearest points, filtered to this doc
        const hits = await qdrant.search("documents", {
            vector: qVector,
            limit: 5,
            filter: {
                must: [{ key: "docId", match: { value: docId } }],
            },
        });
        // 3) pull the TEXT out of each hit's payload
        const context = hits.map((h) => h.payload.content).join("\n\n---\n\n");

        const resp = await openai.chat.completions.create({
            model: "openrouter/free",
            messages: [
                {
                    role: "system",
                    content:
                        "You answer using ONLY the document provided. If the answer isn't in it, say so plainly.",
                },
                {
                    role: "user",
                    content: `Document:\n\n${context}\n\n---\nTask: ${question}`,
                },
            ],
        });
        return res.json({
            // hits,
            // context,
            answer: resp.choices[0].message.content,
            usage: resp.usage, // { prompt_tokens, completion_tokens, total_tokens }
        });

    } catch (error) {
        console.error('Error processing request:', error);
        res.status(500).json({ error: 'Internal Server Error' });
    }
})

app.listen(port, () => {
    console.log(`Server is running on http://localhost:${port}`);
})

// ----------- UNCOMMENT FOR CREATE COLLECTION IN QDRANT -------------

// async function initCollection() {
// // await qdrant.deleteCollection("documents");
// // await qdrant.createCollection("documents", {
// //   vectors: { size: 3072, distance: "Cosine" },
// // });
// await qdrant.createPayloadIndex("documents", {
//   field_name: "docId",
//   field_schema: "keyword", // docId is a string/uuid → use "keyword"
// });
// }
// initCollection()