




import { GoogleGenAI, GenerateContentResponse, GenerateContentParameters, GenerateImagesResponse } from "@google/genai";
import { NewsArticleCore, GroundingSource, PixabayImageHit, ContentType, SelectedLanguageCode, ContentCategoryValue, getLanguageName, SelectedCountryCode, AiProcessedPrompt, SelectedEmotion, Emotions } from '../types.ts';

// Initialize the GoogleGenAI client directly with the API key from the environment variable.
// As per guidelines, assume process.env.API_KEY is pre-configured, valid, and accessible.
const ai = new GoogleGenAI({ apiKey: process.env.API_KEY });

// Pixabay API Key - IMPORTANT: This should ideally be ONLY from process.env in production.
const PIXABAY_API_KEY = process.env.PIXABAY_API_KEY || "50975138-97c32fb2e77ae1bd396f0ec5a"; // Using example key as fallback
if (!process.env.PIXABAY_API_KEY && PIXABAY_API_KEY === "YOUR_PIXABAY_API_KEY_HERE") { // Ensure the fallback is not the placeholder
    console.warn("PIXABAY_API_KEY environment variable not found AND example key is a placeholder. Pixabay image fetching will likely fail. Please set this for production.");
} else if (!process.env.PIXABAY_API_KEY) {
    console.warn("PIXABAY_API_KEY environment variable not found. Using example key. This key might be rate-limited or inactive.");
}


const TEXT_MODEL_NAME = 'gemini-2.5-flash';
const IMAGE_MODEL_NAME = 'imagen-3.0-generate-002';

export function parseJsonFromMarkdown(jsonString: string): any {
  let finalJsonString = jsonString.trim();
  const fenceRegex = /^```(\w*)?\s*\n?(.*?)\n?\s*```$/s; 
  const match = finalJsonString.match(fenceRegex);
  if (match && match[2]) {
    finalJsonString = match[2].trim(); 
  }
  
  try {
    return JSON.parse(finalJsonString);
  } catch (error) {
    console.error("Failed to parse JSON string:", finalJsonString, error);
    throw new Error(`Failed to parse content as JSON. Raw: ${jsonString.substring(0,100)}`);
  }
}

export async function fetchContentFromPrompt(
  prompt: string,
  count: number,
  languageCode: SelectedLanguageCode,
  countryCode: SelectedCountryCode,
  countryName: string,
  emotion: SelectedEmotion
): Promise<{ articles: NewsArticleCore[], sourcesByHeadline: Record<string, GroundingSource[]> }> {
    const languageName = getLanguageName(languageCode);
    const emotionName = Emotions[emotion].split(' ')[1] || 'Neutral';

    const fullPrompt = `
User has requested content based on the following prompt: "${prompt}".
Please generate ${count} unique items. The content should be relevant for ${countryName} and in the ${languageName} language.

STYLE GUIDELINES:
- The overall tone should be influenced by the emotion of: "${emotionName}".
- Generate headlines that are sensational, bold, and highly engaging, like popular social media news feeds.
- Headlines should be attention-grabbing, sometimes shocking, controversial, or expressing a strong opinion related to the emotion.
- Summaries should be short (1-2 sentences), clear, and expand on the headline.

Each item must have a "long_headline" and a "summary".
Prioritize recent and verifiable information if possible, using your knowledge and search capabilities.

Return a single, valid JSON array of objects, like this example:
[
  {"long_headline": "Example Headline 1", "summary": "This is an example summary for the first item."},
  {"long_headline": "Example Headline 2", "summary": "Another example summary for the second item."}
]

Ensure headlines are distinct and summaries are informative.
`;

    const requestParams: GenerateContentParameters = {
        model: TEXT_MODEL_NAME,
        contents: fullPrompt,
        config: {
          temperature: 0.8,
          tools: [{googleSearch: {}}],
        }
    };
    
    return await executeContentFetch(requestParams);
}


export async function fetchContent(
  count: number,
  contentType: ContentType,
  category: ContentCategoryValue,
  languageCode: SelectedLanguageCode,
  countryCode: SelectedCountryCode, 
  countryName: string,
  emotion: SelectedEmotion
): Promise<{ articles: NewsArticleCore[], sourcesByHeadline: Record<string, GroundingSource[]> }> {
  const languageName = getLanguageName(languageCode);
  const emotionName = Emotions[emotion].split(' ')[1] || 'Neutral';
  const itemType = contentType === ContentType.News ? "news articles" : "interesting facts";
  
  const prompt = `
Generate ${count} unique ${itemType} about "${category}" relevant to ${countryName} (especially if not "Worldwide").
The content should be in ${languageName}.

STYLE GUIDELINES:
- The overall tone MUST be influenced by the emotion of: "${emotionName}". For example, if the emotion is 'Anger', the tone should be passionate and critical. If 'Awe', it should be wondrous and inspiring.
- Generate headlines that are sensational, bold, and highly engaging, like popular social media news feeds.
- Headlines MUST be attention-grabbing, sometimes shocking, controversial, or expressing a strong opinion related to the emotion.
- Summaries MUST be short (1-2 sentences), clear, and expand on the headline.

Each item must have a "long_headline" (the sensational headline) and a "summary".

Return a single, valid JSON array of objects, like this example:
[
  {"long_headline": "Example Headline 1", "summary": "This is an example summary for the first item."},
  {"long_headline": "Example Headline 2", "summary": "Another example summary for the second item."}
]

Ensure headlines are distinct and summaries are informative.
Focus on accuracy for the specified language and region, while adhering to the emotional tone and sensational style.
For news, prioritize recent and verifiable information if possible.
`;

  const requestParams: GenerateContentParameters = {
    model: TEXT_MODEL_NAME,
    contents: prompt,
    config: {
      temperature: 0.8, 
    }
  };

  if (contentType === ContentType.News) {
    if (!requestParams.config) requestParams.config = {};
    requestParams.config.tools = [{googleSearch: {}}];
  } else {
    if (!requestParams.config) requestParams.config = {};
    requestParams.config.responseMimeType = "application/json";
  }
  
  return await executeContentFetch(requestParams);
}

async function executeContentFetch(requestParams: GenerateContentParameters): Promise<{ articles: NewsArticleCore[], sourcesByHeadline: Record<string, GroundingSource[]> }> {
    try {
        const response: GenerateContentResponse = await ai.models.generateContent(requestParams);
        const rawText = response.text;
        const parsedData = parseJsonFromMarkdown(rawText);

        if (!Array.isArray(parsedData) || (parsedData.length > 0 && !(parsedData[0].long_headline && parsedData[0].summary))) {
            console.error("Parsed data is not in the expected format:", parsedData);
            throw new Error("AI response was not a valid array of articles/facts.");
        }
        const articles: NewsArticleCore[] = parsedData;

        const sourcesByHeadline: Record<string, GroundingSource[]> = {};
        const groundingMetadata = response.candidates?.[0]?.groundingMetadata;
        if (groundingMetadata?.groundingChunks) {
            articles.forEach(article => {
                const rawChunks = groundingMetadata.groundingChunks;
                if (rawChunks) {
                    sourcesByHeadline[article.long_headline] = rawChunks
                        .filter(chunk => chunk.web && typeof chunk.web.uri === 'string' && typeof chunk.web.title === 'string')
                        .map(chunk => ({ web: { uri: chunk.web!.uri!, title: chunk.web!.title! } }));
                } else {
                    sourcesByHeadline[article.long_headline] = [];
                }
            });
        }
        
        return { articles, sourcesByHeadline };

    } catch (error) {
        console.error("Error fetching content from Gemini:", error);
        if (error instanceof Error && (error.message.includes("API key not valid") || error.message.includes("API_KEY_INVALID"))) {
            throw new Error("Invalid Google API Key. Please check your API key configuration.");
        }
        if (typeof error === 'object' && error !== null && 'message' in error) {
            const errMessage = (error as {message: string}).message;
            if (errMessage.includes("permission") || errMessage.includes("denied")) {
                throw new Error(`Gemini API permission denied. Details: ${errMessage}`);
            }
        }
        throw error;
    }
}


export async function getHighlightedHeadlineHtml(
  originalHeadline: string, 
  languageCode: SelectedLanguageCode,
  highlightColors: string[] 
): Promise<string> {
  const languageName = getLanguageName(languageCode);
  
  const colorsToSuggest = highlightColors.length > 0 ? highlightColors.join(', ') : "'#E74C3C', '#3498DB', '#2ECC71', '#F1C40F'";
  const minColorsToUse = Math.min(highlightColors.length > 0 ? highlightColors.length : 4, 4);

  const prompt = `
You are an expert headline stylist. Your task is to enhance the following headline using ONLY HTML <span style="color: HEX_COLOR_CODE;"> tags for emphasis.
The headline is in ${languageName}.
Original headline: "${originalHeadline}"

Instructions for styling:
1.  ONLY use <span style='color: YOUR_CHOSEN_HEX_COLOR;'> tags. YOUR_CHOSEN_HEX_COLOR must be a valid hex color code (e.g., #FF0000).
2.  DO NOT use any other HTML tags like <b>, <em>, <i>, <u>, <strong>, etc. Do not change font weight or font style.
3.  Choose colors EXCLUSIVELY from this list: [${colorsToSuggest}].
4.  Apply AT LEAST ${minColorsToUse} DIFFERENT colors from the list to different words or meaningful phrases if the headline is long enough and the color palette allows. If the list has fewer unique colors than ${minColorsToUse}, use as many unique colors from the list as possible.
5.  Distribute colors thoughtfully to create a visually appealing and engaging headline. Each word or phrase you color should have its own <span> tag.
6.  Ensure the output is ONLY the HTML-enhanced string. No explanations, no markdown (like \`\`\`html ... \`\`\`), no "html:" prefix. Just the raw HTML.

Example: If original is "Important News Update Today" and colors are ['#FF0000', '#00FF00', '#0000FF', '#FFFF00'], a good response might be:
"<span style='color: #FF0000;'>Important</span> <span style='color: #00FF00;'>News</span> <span style='color: #0000FF;'>Update</span> <span style='color: #FFFF00;'>Today</span>"

Now, style the original headline: "${originalHeadline}" based on these rules using colors from [${colorsToSuggest}].
`;
  try {
    const response: GenerateContentResponse = await ai.models.generateContent({
        model: TEXT_MODEL_NAME,
        contents: prompt,
        config: { temperature: 0.5 }
    });
    let htmlHeadline = response.text.trim();
    
    const htmlFenceRegex = /^```html\s*\n?(.*?)\n?\s*```$/s;
    const fenceMatch = htmlHeadline.match(htmlFenceRegex);
    if (fenceMatch && fenceMatch[1]) {
        htmlHeadline = fenceMatch[1].trim();
    }
    if (htmlHeadline.toLowerCase().startsWith("html:")) {
        htmlHeadline = htmlHeadline.substring(5).trim();
    }

    if (!htmlHeadline.includes("<span")) {
        console.warn("AI response for highlighted headline did not contain <span> tags. Falling back to original.", htmlHeadline);
        return originalHeadline;
    }

    return htmlHeadline || originalHeadline;
  } catch (error) {
    console.error("Error getting highlighted headline:", error);
    return originalHeadline; 
  }
}

export async function generateAiArticleImage(originalHeadline: string, languageCode: SelectedLanguageCode): Promise<string> {
  const languageName = getLanguageName(languageCode);
  const prompt = `Generate a photorealistic image suitable for a news article or content card titled: "${originalHeadline}".
Consider the cultural context of ${languageName} if the language is not English.
The image should be visually appealing, with cinematic lighting and high detail. Aspect ratio should be 1:1 (square).
Focus on creating an image that is directly relevant to the headline's main subject or theme.
`;
  try {
    const response: GenerateImagesResponse = await ai.models.generateImages({
        model: IMAGE_MODEL_NAME,
        prompt: prompt,
        config: { numberOfImages: 1, outputMimeType: 'image/jpeg' }
    });
    if (response.generatedImages && response.generatedImages.length > 0 && response.generatedImages[0].image.imageBytes) {
      const base64ImageBytes = response.generatedImages[0].image.imageBytes;
      return `data:image/jpeg;base64,${base64ImageBytes}`;
    }
    throw new Error("No image generated or image data missing.");
  } catch (error) {
    console.error("Error generating AI article image:", error);
    if (error instanceof Error && (error.message.includes("API key not valid") || error.message.includes("API_KEY_INVALID"))) {
        throw new Error("Invalid Google API Key for image generation.");
    }
    throw error;
  }
}

export async function generateAiObjectImage(objectQuery: string): Promise<string> {
    const prompt = `Generate a photorealistic, high-detail, circular cropped image of a single object: '${objectQuery}'.
The object should be centered on a solid, light gray background (#f0f0f0).
The final image should be perfectly square. Do not include any text or watermarks.`;

    try {
        const response: GenerateImagesResponse = await ai.models.generateImages({
            model: IMAGE_MODEL_NAME,
            prompt: prompt,
            config: { numberOfImages: 1, outputMimeType: 'image/png' } // PNG for potential transparency
        });
        if (response.generatedImages && response.generatedImages.length > 0 && response.generatedImages[0].image.imageBytes) {
            const base64ImageBytes = response.generatedImages[0].image.imageBytes;
            return `data:image/png;base64,${base64ImageBytes}`;
        }
        throw new Error("No object image generated or image data missing.");
    } catch (error) {
        console.error("Error generating AI object image:", error);
        if (error instanceof Error && (error.message.includes("API key not valid") || error.message.includes("API_KEY_INVALID"))) {
            throw new Error("Invalid Google API Key for image generation.");
        }
        throw error;
  }
}


export async function prepareSubjectAndObjectQueries(originalHeadline: string, languageCode: SelectedLanguageCode): Promise<{ subjectQuery: string | null; objectQuery: string | null; error?: string }> {
  const languageName = getLanguageName(languageCode);
  const prompt = `
Analyze the following headline (language: ${languageName}): "${originalHeadline}"
Extract a primary 'subjectQuery' and an optional secondary 'objectQuery' for image searches.
- 'subjectQuery': A noun phrase, ideally 2-4 words, representing the main visual subject.
- 'objectQuery': A distinct noun phrase, ideally 1-3 words, for a secondary visual element, if applicable. Can be null.

Return a single, valid JSON object with keys "subjectQuery" (string or null) and "objectQuery" (string or null).
Example: For "Futuristic City Skyline with Flying Cars", respond:
{"subjectQuery": "futuristic city skyline", "objectQuery": "flying cars"}
Example: For "Cute Cat Sleeping", respond:
{"subjectQuery": "cute cat sleeping", "objectQuery": null}
`;
  try {
    const response: GenerateContentResponse = await ai.models.generateContent({
        model: TEXT_MODEL_NAME,
        contents: prompt,
        config: { responseMimeType: "application/json", temperature: 0.2 }
    });
    const parsed = parseJsonFromMarkdown(response.text);
    return {
        subjectQuery: parsed.subjectQuery || null,
        objectQuery: parsed.objectQuery || null,
    };
  } catch (error) {
    console.error("Error preparing subject/object queries:", error);
    const fallbackSubject = originalHeadline.split(' ').slice(0, 3).join(' ');
    return { 
        subjectQuery: fallbackSubject || "abstract background", 
        objectQuery: null, 
        error: "AI query preparation failed, using fallback." 
    };
  }
}

// Fetches images from Pixabay API
export async function fetchPixabayImages(
    query: string, 
    numberOfImages: number = 1, 
    page: number = 1
): Promise<{ hits: PixabayImageHit[], totalHits: number }> {
  if (!query) {
    return { hits: [], totalHits: 0 };
  }
  if (!PIXABAY_API_KEY || PIXABAY_API_KEY === "YOUR_PIXABAY_API_KEY_HERE") { // Check against placeholder too
    const errorMsg = "Pixabay API key is not configured or is a placeholder. Cannot fetch images.";
    console.error(errorMsg);
    throw new Error(errorMsg);
  }

  // Pixabay API requires `per_page` to be between 3 and 200.
  // Adjust the number if it's outside the valid range to avoid an API error.
  const perPageForApi = Math.max(3, Math.min(numberOfImages, 200));

  const encodedQuery = encodeURIComponent(query);
  const pixabayUrl = `https://pixabay.com/api/?key=${PIXABAY_API_KEY}&q=${encodedQuery}&image_type=photo&per_page=${perPageForApi}&page=${page}&safesearch=true`;

  try {
    const response = await fetch(pixabayUrl);
    if (!response.ok) {
      let errorResponseMessage = `Unknown Pixabay API error (${response.status})`;
      // Read the body ONCE as text to avoid "body stream already read" errors.
      const errorBodyText = await response.text();

      try {
        // Attempt to parse the text as JSON. Pixabay can return error messages as JSON-encoded strings.
        const errorData = JSON.parse(errorBodyText);
        console.error(`Pixabay API error response data (parsed):`, errorData);

        if (typeof errorData === 'string') {
            // e.g., JSON.parse('"Invalid API key"') becomes "Invalid API key"
            errorResponseMessage = errorData;
        } else if (errorData && typeof errorData.message === 'string') {
            // Handle if it's a JSON object with a 'message' property
            errorResponseMessage = errorData.message;
        } else if (errorData && typeof errorData === 'object') {
            // Fallback for other unexpected object structures
            errorResponseMessage = JSON.stringify(errorData);
        }
      } catch (jsonError) {
        // If JSON parsing fails, the response was likely just plain text.
        console.warn("Could not parse Pixabay error response as JSON, using as raw text.", jsonError);
        console.error(`Pixabay API error response (raw text):`, errorBodyText);
        if (errorBodyText) {
          errorResponseMessage = errorBodyText.substring(0, 200); // Limit length for display
        }
      }

      console.error(`Pixabay API error: ${response.status} ${response.statusText}. Message: ${errorResponseMessage}`);
      console.error(`Failing Pixabay URL: ${pixabayUrl}`); // Log the exact URL for debugging
      throw new Error(`Pixabay API request failed: ${response.status} ${response.statusText}. ${errorResponseMessage}`);
    }
    const data = await response.json();

    const hits: PixabayImageHit[] = data.hits.map((hit: any) => ({
      id: hit.id,
      webformatURL: hit.webformatURL,
      largeImageURL: hit.largeImageURL,
      tags: hit.tags,
      user: hit.user,
      previewURL: hit.previewURL,
    }));

    return { hits, totalHits: data.totalHits || data.total }; // totalHits can be 'total' in some cases
  } catch (error) {
    console.error(`Error fetching images from Pixabay for query "${query}":`, error);
    // Don't rethrow with generic "Pixabay API key not configured" if it's already a specific error
    if (error instanceof Error && (error.message.startsWith("Pixabay API key not configured") || error.message.includes("Pixabay API request failed"))) {
        throw error;
    }
    throw new Error(`Failed to fetch images from Pixabay: ${error instanceof Error ? error.message : String(error)}`);
  }
}

export async function processUserPrompt(prompt: string, settingsOptions: any): Promise<AiProcessedPrompt> {
    const systemInstruction = `
You are a helpful AI assistant for a content generation web application. Your task is to understand the user's prompt and respond with a JSON object that the application can use to perform an action.

The user can ask to:
1.  **Update Settings**: Change the visual appearance or content parameters of the cards.
2.  **Generate Content**: Ask for new content cards based on a topic.
3.  **Answer a Question**: Ask a general question not related to settings or content generation.

You MUST respond with a single, valid JSON object with the following structure:
{
  "action": "update_settings" | "generate_content" | "answer_question",
  "settings": { ... }, // ONLY if action is "update_settings". Contains only the keys for settings the user wants to change.
  "content_prompt": "...", // ONLY if action is "generate_content". This should be a clear, self-contained instruction for generating content.
  "answer": "..." // ONLY if action is "answer_question".
}

--- SETTINGS SCHEMA ---
Here are the available settings and their valid options. When updating a setting, you MUST use one of the specified value formats.
${JSON.stringify(settingsOptions, null, 2)}
--- END SETTINGS SCHEMA ---

--- EXAMPLES ---
User Prompt: "Make 5 posts about technology for the USA in hindi"
Your JSON response:
{
  "action": "generate_content",
  "content_prompt": "Generate 5 technology news posts for the USA in Hindi language"
}

User Prompt: "change the headline font to Boogaloo and make the text size 48px"
Your JSON response:
{
  "action": "update_settings",
  "settings": {
    "headlineFontFamily": "Boogaloo, cursive",
    "headlineTextSize": 48
  }
}

User Prompt: "who are you?"
Your JSON response:
{
  "action": "answer_question",
  "answer": "I am an AI assistant integrated into this application to help you generate content and customize its appearance."
}
---

Now, analyze the following user prompt and generate the appropriate JSON response.

User Prompt: "${prompt}"
`;
    
    try {
        const response = await ai.models.generateContent({
            model: TEXT_MODEL_NAME,
            contents: systemInstruction,
            config: {
                responseMimeType: "application/json",
                temperature: 0.1, // Low temperature for predictable JSON output
            },
        });
        const parsedData = parseJsonFromMarkdown(response.text);
        
        // Basic validation of the returned structure
        if (!parsedData.action || !['update_settings', 'generate_content', 'answer_question'].includes(parsedData.action)) {
            throw new Error('AI response has invalid or missing action.');
        }

        return parsedData as AiProcessedPrompt;
    } catch (error) {
        console.error("Error processing user prompt with Gemini:", error);
        if (error instanceof Error) {
           throw error;
        }
        throw new Error("An unexpected error occurred while processing your prompt.");
    }
}

// --- NEW VIRAL POST FUNCTIONS ---

export interface ViralPostContent {
    headline: string;
    summary: string;
    image_prompt: string;
}

export async function generateViralPostContent(topic: string): Promise<ViralPostContent> {
  const prompt = `
You are an expert in creating viral social media content for a South Asian audience. Your task is to take a topic and generate a content package for a viral image post.

The user's topic is: "${topic}"

You MUST generate a JSON object with the following structure:
{
  "headline": "A 4-6 word emotional or shocking headline in bold Hinglish or Hindi.",
  "summary": "A 1-2 sentence summary explaining the context of the headline, in Hinglish or Hindi.",
  "image_prompt": "A detailed, dramatic, and photorealistic prompt for an AI image generator (like Imagen 3) to create the background image. The image should be symbolic, emotional, and visually striking. Describe the scene, mood, and lighting. The image MUST be square (1:1 aspect ratio). Do not include any text in the image prompt."
}

Example for topic "Youth selling kidneys for iPhones":
{
  "headline": "iPhone के लिए बेच दी किडनी!",
  "summary": "एक नए आईफोन के लिए अपनी किडनी बेचने वाले युवाओं की चौंकाने वाली कहानी, जो उपभोक्तावाद के अंधेरे पक्ष पर प्रकाश डालती है।",
  "image_prompt": "A dramatic, dimly lit scene in a slum alley. A young, distressed person is sitting on a stool, clutching a brand new smartphone box while looking at a fresh scar on their side. The mood is desperate and somber. Photorealistic, cinematic lighting, square format, 1:1 aspect ratio."
}

Now, generate the content package for the topic: "${topic}"
`;

    const response = await ai.models.generateContent({
        model: TEXT_MODEL_NAME,
        contents: prompt,
        config: { responseMimeType: "application/json", temperature: 0.7 }
    });
    const parsed = parseJsonFromMarkdown(response.text);
    if (!parsed.headline || !parsed.summary || !parsed.image_prompt) {
        throw new Error("AI response for viral post did not contain the required fields.");
    }
    return parsed;
}

export async function generateViralImage(prompt: string): Promise<string> {
    try {
        const response: GenerateImagesResponse = await ai.models.generateImages({
            model: IMAGE_MODEL_NAME,
            prompt: prompt,
            config: { 
                numberOfImages: 1, 
                outputMimeType: 'image/jpeg',
                // Aspect ratio is guided by the prompt itself
            }
        });
        if (response.generatedImages && response.generatedImages.length > 0 && response.generatedImages[0].image.imageBytes) {
            const base64ImageBytes = response.generatedImages[0].image.imageBytes;
            return `data:image/jpeg;base64,${base64ImageBytes}`;
        }
        throw new Error("No viral image generated or image data missing.");
    } catch (error) {
        console.error("Error generating AI viral image:", error);
        if (error instanceof Error && (error.message.includes("API key not valid") || error.message.includes("API_KEY_INVALID"))) {
            throw new Error("Invalid Google API Key for image generation.");
        }
        throw error;
    }
}

export async function generateCaptionForScheduling(
    sourceText: string,
    mode: 'demo' | 'filename'
): Promise<string> {
    const prompt = mode === 'demo'
        ? `You are an expert social media manager. The user has provided a sample caption: "${sourceText}". 
           Create a new, engaging, and slightly different caption based on this sample. 
           Maintain a similar tone but rephrase it to sound fresh. 
           Include 3-5 relevant and popular hashtags.
           Finally, append a short, engaging call-to-action (CTA) on a new line to encourage user interaction (e.g., "What are your thoughts?", "Tag a friend who can relate!", "Let us know in the comments!").
           The output should be ONLY the caption text. No explanations.`
        : `You are an expert social media manager. An image has been uploaded with the filename: "${sourceText}".
           Based on this filename, generate a creative and engaging caption for a social media post.
           The caption should be descriptive and interesting.
           Include 3-5 relevant and popular hashtags based on the filename.
           Finally, append a short, engaging call-to-action (CTA) on a new line to encourage user interaction (e.g., "What do you think?", "Tag a friend!", "Let me know your reaction below.").
           The output should be ONLY the caption text. No explanations.`;

    try {
        const response = await ai.models.generateContent({
            model: TEXT_MODEL_NAME,
            contents: prompt,
            config: { temperature: 0.7 }
        });
        return response.text.trim();
    } catch (error) {
        console.error("Error generating caption:", error);
        // Fallback to a simple caption
        return `${sourceText.replace(/[-_]/g, ' ')}\n\n#general #post\nWhat do you think?`;
    }
}

export async function generateSingleBestReply(postCaption: string, commentText: string): Promise<string> {
    const prompt = `
As an expert social media manager, analyze the post and the comment, then craft the single best reply.

**Post Caption Context:** "${postCaption || 'No specific caption provided.'}"
**User's Comment:** "${commentText}"

**Your Task:**
1.  **Analyze and Detect Language:** Read the user's comment to understand its language (e.g., Hindi, English, Hinglish).
2.  **Craft Reply in Same Language:** Write a reply in the **same language** as the comment.
3.  **Use Emojis:** Naturally integrate 1-2 relevant emojis to make the reply engaging (e.g., 🙏, 😊, 🔥).
4.  **Ask an Engaging Question:** End your main reply with a relevant, open-ended question to encourage further conversation.
5.  **Add Call to Action (CTA):** On a new line after your reply and question, add the following text exactly: "For more, Like, Follow, and Share!"

**Example:**
-   *User's Comment (Hindi):* "बहुत बढ़िया पोस्ट!"
-   *Your Reply:*
    "शुक्रिया! 🙏 आपको इस पोस्ट में सबसे अच्छा क्या लगा?
    For more, Like, Follow, and Share!"

**Your Final Output MUST be ONLY the reply text, formatted as shown above.** Do not add any extra explanations.
`;
    try {
        const response = await ai.models.generateContent({
            model: TEXT_MODEL_NAME,
            contents: prompt,
            config: {
                temperature: 0.8
            }
        });
        return response.text.trim();
    } catch (error) {
        console.error("Error generating single best reply:", error);
        return "Thank you for your comment!"; // Fallback reply
    }
}

export async function getPageInsights(jsonData: string, pageName: string): Promise<string> {
    const prompt = `
    Analyze the following Facebook Page insights data for the page named "${pageName}". The data is in JSON format.
    JSON Data: ${jsonData}

    Based on this data, provide 3 concise, actionable, and data-driven tips to help the user increase their engagement and follower growth.
    Structure your response as a simple string, with each tip on a new line. Start each tip with a number (1., 2., 3.).
    Focus on identifying high-performing content, trends in follower growth, and suggestions for improving reach.
    Keep the tone encouraging and professional. Be specific in your advice.

    Example format for engagement data:
    1. Your top post about [Topic Name] received high engagement. Create more content on similar topics to boost interaction.
    2. Your follower growth spiked on Saturday. This suggests your audience is most active on weekends. Plan key posts for Saturdays.
    3. You have a high number of new followers but lower engagement. Try asking more questions in your captions to encourage comments and build community.
    `;

    try {
        const response = await ai.models.generateContent({
            model: TEXT_MODEL_NAME,
            contents: prompt,
            config: { temperature: 0.6 }
        });
        return response.text.trim();
    } catch (error) {
        console.error("Error getting page insights:", error);
        throw new Error("Failed to generate AI page insights.");
    }
}

export async function generateCrossPostCaption(originalCaption: string): Promise<string> {
    const prompt = `
You are an expert social media manager specializing in creating viral, human-like content.
Your task is to rewrite an original caption into a new, long, descriptive, and aesthetically pleasing paragraph for cross-posting.

Original Caption: "${originalCaption || 'An interesting image.'}"

Instructions:
1.  **Start with a Hook:** Begin the caption with a strong, attention-grabbing question or statement to immediately stop the scroll.
2.  **Adopt a Storytelling Tone:** Rewrite the original caption into a new, long, descriptive, and human-like paragraph. Use a conversational, storytelling tone. Make it feel personal and authentic.
3.  **Incorporate Emojis:** Naturally weave in 3-4 relevant emojis to add visual appeal and emotion.
4.  **Add a Call-to-Action:** End with an engaging question to encourage user interaction.
5.  **Add Hashtags:** On new lines after the main caption, add 5-6 relevant and popular hashtags. Start a new line for the hashtags.

Example:
- Original Caption: "Amazing sunset today!"
- Your Output:
"Ever seen a sky so beautiful it just stops you in your tracks? 🌅

That was my evening today. The sky was painted in the most incredible shades of orange, pink, and purple, melting into the horizon. It's moments like these that remind you to pause and appreciate the simple beauty around us. Truly magical! ✨🧡

What's the most beautiful sunset you've ever seen? Let me know below! 👇

#sunsetlovers #beautifulsky #naturephotography #skyonfire #eveningvibes #peacefulmoments"

**Your final output MUST be ONLY the new caption text, formatted as shown above.** Do not add any extra explanations.
Now, rewrite this caption: "${originalCaption}"
`;
    try {
        const response = await ai.models.generateContent({
            model: TEXT_MODEL_NAME,
            contents: prompt,
            config: {
                temperature: 0.8
            }
        });
        return response.text.trim();
    } catch (error) {
        console.error("Error generating cross-post caption:", error);
        return `${originalCaption || ''}\n\n#crosspost #repost #post`; // Fallback
    }
}
