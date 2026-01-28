import { GoogleGenAI, Type } from "@google/genai";

const ai = new GoogleGenAI({ apiKey: process.env.API_KEY });

// Helper to generate text-based content
export const generateIdeas = async (prompt: string): Promise<string[]> => {
  try {
    const response = await ai.models.generateContent({
      model: "gemini-3-flash-preview",
      contents: `Generate a list of 5 short, creative concepts or keywords for a moodboard based on this request: "${prompt}". Return only the items as a JSON list of strings.`,
      config: {
        responseMimeType: "application/json",
        responseSchema: {
          type: Type.ARRAY,
          items: { type: Type.STRING },
        },
      },
    });

    const json = JSON.parse(response.text || '[]');
    return json;
  } catch (error) {
    console.error("Error generating ideas:", error);
    return ["Inspiration", "Creativity", "Focus", "Design", "Light"];
  }
};

// Helper to generate an image
export const generateMoodboardImage = async (prompt: string): Promise<string | null> => {
  try {
    const response = await ai.models.generateContent({
      model: "gemini-2.5-flash-image",
      contents: prompt,
      // config: { responseMimeType: "application/json" } // Removed as it is not supported for nano banana series models
    });
    
    // We need to iterate through parts to find the inline data
    const parts = response.candidates?.[0]?.content?.parts;
    if (parts) {
      for (const part of parts) {
        if (part.inlineData && part.inlineData.data) {
           return `data:${part.inlineData.mimeType};base64,${part.inlineData.data}`;
        }
      }
    }
    return null;
  } catch (error) {
    console.error("Error generating image:", error);
    return null;
  }
};