// Passo 1: Importar as dependências
import express from 'express';
import dotenv from 'dotenv';
import cors from 'cors';
import { TextractClient, DetectDocumentTextCommand } from '@aws-sdk/client-textract';
import OpenAI from 'openai';

// Carregar as variáveis de ambiente do arquivo .env (para desenvolvimento local)
// A Vercel usará as variáveis configuradas na interface web
dotenv.config();

// --- CONFIGURAÇÃO DAS APIs ---

// Configurar cliente do AWS Textract
const textractClient = new TextractClient({
    region: process.env.AWS_REGION,
    credentials: {
        accessKeyId: process.env.AWS_ACCESS_KEY_ID,
        secretAccessKey: process.env.AWS_SECRET_ACCESS_KEY,
    },
});

// Configurar cliente da OpenAI
const openai = new OpenAI({
    apiKey: process.env.OPENAI_API_KEY,
});

// --- CONFIGURAÇÃO DO SERVIDOR EXPRESS ---

const app = express();

// Middlewares
app.use(cors()); // Habilita o CORS para permitir requisições do frontend
app.use(express.json({ limit: '10mb' })); // Permite que o servidor receba JSON e aumenta o limite para aceitar imagens em base64

// --- DEFINIÇÃO DAS ROTAS ---

/**
 * Rota para extrair texto de uma imagem usando AWS Textract.
 * Recebe: { imageBase64: "data:image/png;base64,..." }
 * Retorna: { text: "O texto extraído da imagem." }
 */
app.post('/api/ocr-aws', async (req, res) => {
    try {
        const { imageBase64 } = req.body;
        if (!imageBase64) {
            return res.status(400).json({ error: 'Nenhuma imagem fornecida.' });
        }

        // Converte a string base64 em um buffer
        const base64Data = imageBase64.replace(/^data:image\/\w+;base64,/, '');
        const imageBuffer = Buffer.from(base64Data, 'base64');

        // Cria e envia o comando para o Textract
        const command = new DetectDocumentTextCommand({
            Document: { Bytes: imageBuffer },
        });
        const data = await textractClient.send(command);
        
        // Processa a resposta para extrair o texto
        let extractedText = '';
        if (data.Blocks) {
            extractedText = data.Blocks
                .filter(block => block.BlockType === 'LINE')
                .map(block => block.Text)
                .join(' ');
        }

        console.log("Texto extraído com sucesso.");
        res.json({ text: extractedText });

    } catch (error) {
        console.error('Erro no endpoint de OCR:', error);
        res.status(500).json({ error: 'Falha ao processar a imagem com AWS Textract.' });
    }
});


/**
 * Rota para gerar uma imagem a partir de um prompt usando OpenAI DALL-E.
 * Recebe: { prompt: "Um texto descritivo." }
 * Retorna: { imageURL: "https://url.da.imagem.gerada" }
 */
app.post('/api/generate-image-openai', async (req, res) => {
    try {
        const { prompt } = req.body;
        if (!prompt || prompt.trim().length === 0) {
            return res.status(400).json({ error: 'Nenhum prompt fornecido.' });
        }

        console.log(`Gerando imagem para o prompt: "${prompt}"`);

        // Chama a API da OpenAI para gerar a imagem
        const response = await openai.images.generate({
            model: "dall-e-3",
            prompt: prompt,
            n: 1,
            size: "1024x1024",
            quality: "standard",
        });

        const imageURL = response.data[0].url;
        console.log("Imagem gerada com sucesso:", imageURL);
        res.json({ imageURL: imageURL });

    } catch (error) {
        console.error('Erro no endpoint de geração de imagem da OpenAI:', error);
        res.status(500).json({ error: 'Falha ao gerar a imagem com a API da OpenAI.' });
    }
});

// --- ATUALIZAÇÃO PARA VERCEL ---
// Em vez de iniciar um servidor com app.listen, exportamos o app.
// A Vercel vai usar esta exportação para criar a Serverless Function.
export default app;