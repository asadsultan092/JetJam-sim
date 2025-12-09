import { GoogleGenAI } from "@google/genai";
import { SimulationLog, AttackType } from '../types';

// Initialize Gemini Client
// Requires process.env.API_KEY to be set
const getClient = () => {
  const apiKey = process.env.API_KEY;
  if (!apiKey) return null;
  return new GoogleGenAI({ apiKey });
};

export const analyzeSimulationData = async (
  logs: SimulationLog[],
  currentAttack: AttackType
): Promise<string> => {
  const ai = getClient();
  if (!ai) {
    return "API Key not configured. Unable to perform AI analysis.";
  }

  // Sample relevant logs (last 50 for trend, or spread out if analyzing full set)
  // For this prompt, we take the last 30 to keep context window small but relevant
  const recentLogs = logs.slice(-30);
  const logsText = JSON.stringify(recentLogs);

  const prompt = `
    You are a data scientist and cybersecurity expert preparing a dataset to train an ML model for detecting Wireless Sensor Network (WSN) jamming attacks.
    
    The user is currently simulating a "${currentAttack}" attack.
    
    Here is a sample of the CSV data generated (last 30 records):
    Headers: [Timestamp, AttackType, PDR, PLR, Throughput, Latency, Energy, AvgLinkQuality, JammingIntensity]
    Data:
    ${logsText}
    
    Please provide an analysis for the ML engineer:
    1. **Feature Importance**: Based on the data above, which metrics (PDR, Latency, LinkQuality, etc.) show the strongest correlation with this specific attack type?
    2. **Attack Signature**: Describe the statistical signature of this attack. (e.g., "Reactive attacks show high Latency spikes but intermittent PDR drops, whereas Constant attacks show near-zero PDR").
    3. **Threshold Suggestion**: If you were writing a simple heuristic rule before the ML model is ready, what thresholds would you set to detect this?
    
    Keep it concise and focused on helping the user understand the data they are collecting.
  `;

  try {
    const response = await ai.models.generateContent({
      model: 'gemini-2.5-flash',
      contents: prompt,
      config: {
        thinkingConfig: { thinkingBudget: 0 }
      }
    });
    return response.text || "No analysis generated.";
  } catch (error) {
    console.error("Gemini analysis failed:", error);
    return "Failed to generate analysis. Please try again.";
  }
};