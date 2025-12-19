import {GenerateContentResponse, GoogleGenAI} from "@google/genai";
import {getCloudflareContext} from "@opennextjs/cloudflare";

export type AspectRatio = '1:1' | '2:3' | '3:2' | '3:4' | '4:3' |'4:5' | '5:4' | '9:16' | '16:9' | '21:9';

export type ImageSize = '1K' | '2K' | '4K';

export async function generateContent(prompt: string, aspectRatio?: AspectRatio, imageSize?: ImageSize): Promise<GenerateContentResponse> {
    const apiKey = await getCloudflareContext().env.GEMINI_API_KEY.get()
    const gatewayToken = await getCloudflareContext().env.AI_GATEWAY_TOKEN.get()
    const baseUrl = await getCloudflareContext().env.AI.gateway('ai-gallery').getUrl('google-ai-studio')
    const ai = new GoogleGenAI({
        apiKey,
        httpOptions: {
            baseUrl,
            headers: {
                Authorization: `Bearer ${gatewayToken}`
            }
        }
    });
    return ai.models.generateContent({
        model: 'gemini-3-pro-image-preview',
        contents: prompt,
        config: {
            responseModalities: ['TEXT', 'IMAGE'],
            imageConfig: {
                aspectRatio,
                imageSize,
            },
        },
    })
}