
import React, { useState, useEffect, useCallback, ChangeEvent, FormEvent, useMemo } from 'react';
import { useTheme } from './components/Layout.tsx';
import NewsCard from './components/NewsCard.tsx';
import ViralPostCard from './components/ViralPostCard.tsx';
import Spinner from './components/Spinner.tsx';
import { 
    GenerateIcon, DownloadAllIcon, SunIcon, MoonIcon, PaletteIcon, CloseIcon,
    OverlayTopIcon, OverlayBottomIcon, OverlayLeftIcon, OverlayRightIcon,
    ChevronUpIcon, ChevronDownIcon, TrashIcon, EditIcon
} from './components/IconComponents.tsx';
import * as geminiService from './services/geminiService.ts';
import { 
  NewsArticle, NewsArticleCore, CardDisplayState, AppSettings, ContentType, ContentCategory, LanguageOptions, CountryOptions, 
  HeadlineFontOptions, FontWeightOptions, FontSizeOptions, TextCase, OutlineType, TextAlign, OverlayPosition, OverlayBorderPosition,
  SelectedHeadlineFontFamily, SelectedFontWeight, ContentCategoryValue, SelectedLanguageCode, SelectedCountryCode, FontSizeKey,
  getCountryName,
  DEFAULT_HIGHLIGHT_COLORS, MAX_HIGHLIGHT_COLORS, MIN_HIGHLIGHT_COLORS,
  HeaderType, GradientDirection, GradientDirectionOptions,
  AppThemeSettings, GlobalFontOptions, SelectedGlobalFontFamily, DEFAULT_THEME_SETTINGS, darkenColor, getContrastingTextColor,
  isValidHexColor, AiProcessedPrompt, CardStyleSettings, CardData, ViralPost,
  Emotions, SelectedEmotion
} from './types.ts';
import { useSidebar } from './src/contexts/SidebarContext.tsx'; 
import CustomColorPicker from './components/CustomColorPicker.tsx';
import { useNotification } from './src/contexts/NotificationContext.tsx';

import html2canvas from 'html2canvas';
import JSZip from 'jszip';

const APP_SETTINGS_KEY = 'aiContentCardGeneratorSettings_v6'; 
const APP_THEME_SETTINGS_KEY = 'aiContentCardThemeSettings_v1';

const INITIAL_CARD_STYLES: CardStyleSettings = {
  headlineFontFamily: 'Inter, sans-serif',
  headlineFontWeight: 'bold',
  headlineTextSize: 32,
  headlineTextAlign: 'center',
  headlineTextWidth: 100,
  headlineLetterSpacing: 0,
  headlineLineHeight: 1.6,
  headlineHighlightColors: DEFAULT_HIGHLIGHT_COLORS,
  headerType: HeaderType.Solid,
  selectedHeaderColor: '#facc15',
  headerGradientDirection: 'to right',
  headerGradientColor1: '#60A5FA',
  headerGradientColor2: '#C084FC',
  textCase: TextCase.Default,
  showSummary: true,
  summaryFontSizeKey: 'medium',
  showSources: true,
  outlineEnabled: false,
  outlineColor: '#C2FF00',
  outlineType: OutlineType.Solid,
  outlineWidth: 2,
  outlineRoundedCorners: 12,
  outlineOffset: 0,
  overlayVisible: false,
  overlayPosition: 'bottom',
  overlayIsSolid: true,
  overlayBackgroundColor: '#000000',
  overlayHeight: 30,
  overlayOneSideBorderEnabled: false,
  overlayBorderColor: '#FF0000',
  overlayBorderWidth: 2,
  overlayBorderPosition: 'top',
};

// Helper to get a safe color or a default
const getSafeColor = (color: string, defaultColor: string): string => {
    return isValidHexColor(color) ? color : defaultColor;
};

const MainAppPage: React.FC = () => {
  const { theme: globalTheme, toggleTheme: toggleGlobalTheme } = useTheme();
  const { setSidebarControls } = useSidebar(); 
  const { addNotification } = useNotification();

  // Core State
  const [cards, setCards] = useState<CardData[]>([]);
  const [isLoading, setIsLoading] = useState<boolean>(false); 
  const [isPreparingArticles, setIsPreparingArticles] = useState<boolean>(false); 
  const [isDownloadingAll, setIsDownloadingAll] = useState<boolean>(false);

  // Per-card editing state
  const [editingCardId, setEditingCardId] = useState<string | null>(null);
  const [isEditingAll, setIsEditingAll] = useState<boolean>(false);

  // Prompt state
  const [userPrompt, setUserPrompt] = useState<string>('');
  const [isProcessingPrompt, setIsProcessingPrompt] = useState<boolean>(false);
  
  // Viral Post Modal State
  const [isViralPostModalOpen, setIsViralPostModalOpen] = useState<boolean>(false);

  // Color Picker State
  const [activeColorPicker, setActiveColorPicker] = useState<string | null>(null);

  // App Settings State (defaults for new cards)
  const [postCount, setPostCount] = useState<number>(3);
  const [selectedContentType, setSelectedContentType] = useState<ContentType>(ContentType.News);
  const [selectedContentCategory, setSelectedContentCategory] = useState<ContentCategoryValue>(ContentCategory.GENERAL);
  const [selectedLanguage, setSelectedLanguage] = useState<SelectedLanguageCode>('en');
  const [selectedCountryCode, setSelectedCountryCode] = useState<SelectedCountryCode>('WW');
  const [selectedEmotion, setSelectedEmotion] = useState<SelectedEmotion>('Neutral');
  
  // Consolidated default styles state
  const [defaultStyles, setDefaultStyles] = useState<CardStyleSettings>(INITIAL_CARD_STYLES);

  // Accordion State
  const [isGeneralSettingsOpen, setIsGeneralSettingsOpen] = useState<boolean>(true);
  const [isHeadlineSettingsOpen, setIsHeadlineSettingsOpen] = useState<boolean>(false);
  const [isHighlightColorsSettingsOpen, setIsHighlightColorsSettingsOpen] = useState<boolean>(false); 
  const [isSummarySettingsOpen, setIsSummarySettingsOpen] = useState<boolean>(false);
  const [isCardOutlineSettingsOpen, setIsCardOutlineSettingsOpen] = useState<boolean>(false);
  const [isImageOverlaySettingsOpen, setIsImageOverlaySettingsOpen] = useState<boolean>(false);

  // Theme Customization State
  const [isThemePanelOpen, setIsThemePanelOpen] = useState<boolean>(false);
  const [themeSettings, setThemeSettings] = useState<AppThemeSettings>(DEFAULT_THEME_SETTINGS);

  const handleColorPickerToggle = useCallback((pickerId: string) => {
    setActiveColorPicker(prev => (prev === pickerId ? null : pickerId));
  }, []);

  // Load App Settings from localStorage
  useEffect(() => {
    const savedSettingsRaw = localStorage.getItem(APP_SETTINGS_KEY);
    if (savedSettingsRaw) {
      try {
        const savedSettings = JSON.parse(savedSettingsRaw) as AppSettings;
        const setFromSaved = <T,>(setter: React.Dispatch<React.SetStateAction<T>>, savedValue: T | undefined, defaultValue: T) => {
          setter(savedValue !== undefined ? savedValue : defaultValue);
        };

        setFromSaved(setPostCount, savedSettings.postCount, 3);
        setFromSaved(setSelectedContentType, savedSettings.selectedContentType, ContentType.News);
        setFromSaved(setSelectedContentCategory, savedSettings.selectedContentCategory, ContentCategory.GENERAL);
        setFromSaved(setSelectedLanguage, savedSettings.selectedLanguage, 'en');
        setFromSaved(setSelectedCountryCode, savedSettings.selectedCountryCode, 'WW');
        setFromSaved(setSelectedEmotion, savedSettings.selectedEmotion, 'Neutral');
        
        // Populate defaultStyles state from the flat savedSettings object
        const loadedStyles: CardStyleSettings = { ...INITIAL_CARD_STYLES };
        for (const key in INITIAL_CARD_STYLES) {
          if (Object.prototype.hasOwnProperty.call(savedSettings, key)) {
            const savedValue = (savedSettings as any)[key];
            if (savedValue !== undefined) {
              (loadedStyles as any)[key] = savedValue;
            }
          }
        }
        setDefaultStyles(loadedStyles);

      } catch (e) {
        console.error("Failed to parse saved app settings:", e);
        localStorage.removeItem(APP_SETTINGS_KEY); 
      }
    }
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []); 

  // Save App Settings to localStorage
  useEffect(() => {
    const currentSettings: AppSettings = {
      // Content settings
      postCount, selectedContentType, selectedContentCategory, selectedLanguage, selectedCountryCode, selectedEmotion,
      // Default style settings
      ...defaultStyles
    };
    localStorage.setItem(APP_SETTINGS_KEY, JSON.stringify(currentSettings));
  }, [
    postCount, selectedContentType, selectedContentCategory, selectedLanguage, selectedCountryCode, selectedEmotion,
    defaultStyles
  ]);

  // Load Theme Settings from localStorage
  useEffect(() => {
    const savedThemeSettingsRaw = localStorage.getItem(APP_THEME_SETTINGS_KEY);
    if (savedThemeSettingsRaw) {
      try {
        const savedTheme = JSON.parse(savedThemeSettingsRaw) as AppThemeSettings;
        // Validate loaded theme settings before applying
        const validatedTheme: AppThemeSettings = {
            ...DEFAULT_THEME_SETTINGS, // Start with defaults
            ...savedTheme, // Override with saved values
            // Ensure colors are valid, otherwise use defaults
            primaryColor: getSafeColor(savedTheme.primaryColor, DEFAULT_THEME_SETTINGS.primaryColor),
            backgroundSolidColor: getSafeColor(savedTheme.backgroundSolidColor, DEFAULT_THEME_SETTINGS.backgroundSolidColor),
            backgroundGradientStart: getSafeColor(savedTheme.backgroundGradientStart, DEFAULT_THEME_SETTINGS.backgroundGradientStart),
            backgroundGradientEnd: getSafeColor(savedTheme.backgroundGradientEnd, DEFAULT_THEME_SETTINGS.backgroundGradientEnd),
        };
        setThemeSettings(validatedTheme);
      } catch (e) {
        console.error("Failed to parse saved theme settings:", e);
        localStorage.removeItem(APP_THEME_SETTINGS_KEY);
        setThemeSettings(DEFAULT_THEME_SETTINGS); // Fallback to default
      }
    }
  }, []);

  // Apply and Save Theme Settings
  useEffect(() => {
    const { 
      globalFontFamily, primaryColor, 
      backgroundType, backgroundSolidColor, 
      backgroundGradientStart, backgroundGradientEnd, backgroundGradientDirection 
    } = themeSettings;

    const safePrimaryColor = getSafeColor(primaryColor, DEFAULT_THEME_SETTINGS.primaryColor);
    const primaryTextColor = getContrastingTextColor(safePrimaryColor);

    document.documentElement.style.setProperty('--app-font-family', globalFontFamily);
    document.documentElement.style.setProperty('--app-primary-color', safePrimaryColor);
    document.documentElement.style.setProperty('--app-primary-color-hover', darkenColor(safePrimaryColor, 10));
    document.documentElement.style.setProperty('--app-primary-color-text', primaryTextColor);

    let bgStyle = '';
    if (backgroundType === 'solid') {
      const safeBgSolid = getSafeColor(backgroundSolidColor, DEFAULT_THEME_SETTINGS.backgroundSolidColor);
      bgStyle = safeBgSolid;
      document.documentElement.style.setProperty('--app-bg', safeBgSolid);
    } else {
      const safeBgGradStart = getSafeColor(backgroundGradientStart, DEFAULT_THEME_SETTINGS.backgroundGradientStart);
      const safeBgGradEnd = getSafeColor(backgroundGradientEnd, DEFAULT_THEME_SETTINGS.backgroundGradientEnd);
      bgStyle = `linear-gradient(${backgroundGradientDirection}, ${safeBgGradStart}, ${safeBgGradEnd})`;
      document.documentElement.style.setProperty('--app-bg', safeBgGradStart); 
    }
    document.body.style.background = bgStyle;

    localStorage.setItem(APP_THEME_SETTINGS_KEY, JSON.stringify(themeSettings));
  }, [themeSettings, globalTheme]);

  const handleThemeSettingChange = <K extends keyof AppThemeSettings>(key: K, value: AppThemeSettings[K]) => {
    setThemeSettings(prev => ({ ...prev, [key]: value }));
  };
  
  const updateCardState = useCallback((id: string, updates: Partial<CardData>) => {
    setCards(prevCards => 
      prevCards.map(card => card.id === id ? { ...card, ...updates } as CardData : card)
    );
  }, []);
  
  const handleUpdateCardStyle = useCallback((articleId: string, newStyles: Partial<CardStyleSettings>) => {
    setCards(prev => prev.map(c =>
      (c.id === articleId && c.type === 'news')
        ? { ...c, style: { ...c.style, ...newStyles } }
        : c
    ));
  }, []);

  const handleStyleChange = useCallback(<K extends keyof CardStyleSettings>(key: K, value: CardStyleSettings[K]) => {
    if (isEditingAll) {
      // Apply to all news cards
      setCards(prev => prev.map(c =>
        c.type === 'news' ? { ...c, style: { ...c.style, [key]: value } } : c
      ));
      // Also update default styles so new cards match
      setDefaultStyles(prev => ({ ...prev, [key]: value }));
    } else if (editingCardId) {
      // Apply to a single selected card
      handleUpdateCardStyle(editingCardId, { [key]: value });
    } else {
      // Apply to default styles for new cards
      setDefaultStyles(prev => ({ ...prev, [key]: value }));
    }
  }, [editingCardId, handleUpdateCardStyle, isEditingAll]);

  const handleLocalImageUpload = useCallback((articleId: string, file: File) => {
    const localUrl = URL.createObjectURL(file);
    updateCardState(articleId, { localImageUrl: localUrl });
  }, [updateCardState]);

  const handleGenerateContent = useCallback(async (customPrompt?: string) => {
    setIsLoading(true);
    setIsPreparingArticles(true);

    try {
      const countryName = getCountryName(selectedCountryCode);
      let fetchedData;

      if(customPrompt){
         fetchedData = await geminiService.fetchContentFromPrompt(customPrompt, postCount, selectedLanguage, selectedCountryCode, countryName, selectedEmotion);
      } else {
         fetchedData = await geminiService.fetchContent(
            postCount, selectedContentType, selectedContentCategory, selectedLanguage, selectedCountryCode, countryName, selectedEmotion
        );
      }
      
      const { articles: fetchedArticlesCore, sourcesByHeadline } = fetchedData;
      
      if (!fetchedArticlesCore || fetchedArticlesCore.length === 0) {
        if(customPrompt){
            addNotification("I couldn't generate any content for that prompt. Please try a different one.", "info");
        } else {
            addNotification("The AI returned no content for the selected category. Please try again.", "error");
        }
        setIsLoading(false);
        setIsPreparingArticles(false);
        return;
      }

      const newArticles: CardData[] = fetchedArticlesCore.map((core: NewsArticleCore, index: number): CardData => ({
        ...core,
        type: 'news',
        id: `${Date.now()}-${index}-${Math.random().toString(16).slice(2)}`,
        sources: sourcesByHeadline[core.long_headline] || [],
        isHighlighting: true,
        style: { ...defaultStyles },
        localImageUrl: null,
        subjectPixabayQuery: null,
        isSubjectQueryReady: false,
        pixabayImages: [],
        subjectPixabayError: null,
        objectAiImageQuery: null,
        isObjectAiImageQueryReady: false,
        objectAiImageUrl: null,
        isObjectAiImageLoading: false,
        objectAiImageError: null,
        aiImageUrl: null,
        isAiImageLoading: false,
        aiImageError: null,
        displayState: CardDisplayState.INITIAL,
      }));

      setCards(prev => [...prev, ...newArticles]);
      setIsLoading(false); 

      // Kick off async processes for each new card
      for (const card of newArticles) {
          if (card.type === 'news') {
              (async () => {
                  const article = card as NewsArticle;
                  try {
                      const htmlHeadline = await geminiService.getHighlightedHeadlineHtml(article.long_headline, selectedLanguage, article.style.headlineHighlightColors);
                      updateCardState(article.id, { highlighted_headline_html: htmlHeadline, isHighlighting: false });
                  } catch (e) {
                      console.error(`Error highlighting headline for ${article.id}:`, e);
                      updateCardState(article.id, { highlighted_headline_html: article.long_headline, isHighlighting: false });
                  }

                  try {
                      const queries = await geminiService.prepareSubjectAndObjectQueries(article.long_headline, selectedLanguage);
                      updateCardState(article.id, {
                          subjectPixabayQuery: queries.subjectQuery,
                          objectAiImageQuery: queries.objectQuery,
                          isSubjectQueryReady: !!queries.subjectQuery,
                          isObjectAiImageQueryReady: !!queries.objectQuery,
                          subjectPixabayError: queries.error || null,
                          displayState: queries.subjectQuery ? CardDisplayState.PIXABAY_FETCHING : CardDisplayState.SUBJECT_OBJECT_QUERY_FAILED
                      });

                      if (queries.subjectQuery) {
                          try {
                              const { hits } = await geminiService.fetchPixabayImages(queries.subjectQuery, 1, 1);
                              updateCardState(article.id, {
                                  pixabayImages: hits,
                                  displayState: hits.length > 0 ? CardDisplayState.PIXABAY_HAS_IMAGES : CardDisplayState.PIXABAY_NO_IMAGES_FOUND,
                                  subjectPixabayError: hits.length === 0 ? `No images found on Pixabay for "${queries.subjectQuery}".` : null,
                              });
                          } catch (e: any) {
                              console.error(`Error fetching subject images from Pixabay for ${article.id}:`, e);
                              updateCardState(article.id, { subjectPixabayError: e.message || "Failed to fetch subject images from Pixabay.", displayState: CardDisplayState.PIXABAY_ERROR });
                          }
                      }

                      if (queries.objectQuery) {
                          updateCardState(article.id, { isObjectAiImageLoading: true });
                          try {
                              const imageUrl = await geminiService.generateAiObjectImage(queries.objectQuery);
                              updateCardState(article.id, {
                                  objectAiImageUrl: imageUrl,
                                  isObjectAiImageLoading: false,
                              });
                          } catch (e: any) {
                              console.error(`Error generating object image for ${article.id}:`, e);
                              updateCardState(article.id, { isObjectAiImageLoading: false, objectAiImageError: e.message || "Failed to generate object image." });
                          }
                      }
                  } catch (e: any) {
                      console.error(`Error preparing queries for ${article.id}:`, e);
                      updateCardState(article.id, {
                          subjectPixabayError: e.message || "Query preparation failed.",
                          displayState: CardDisplayState.SUBJECT_OBJECT_QUERY_FAILED,
                          isHighlighting: false
                      });
                  }
              })();
          }
      }

    } catch (e: any) { 
      console.error("Error generating content:", e);
      let errorMessage = "Failed to generate content.";
      if (typeof e.message === 'string') {
        if (e.message.includes("API Key is not valid") || e.message.includes("API_KEY_INVALID") || e.message.includes("API key not valid")) {
          errorMessage = "An API Key is not valid or improperly configured. Please check your setup.";
        } else if (e.message.toLowerCase().includes("quota") || e.message.includes("resource_exhausted") || e.message.includes("429")) {
          errorMessage = "API quota exceeded or rate limit reached. Please try again later.";
        } else if (e.message.includes("Pixabay API key not configured")) {
            errorMessage = "Pixabay API key is missing or is a placeholder. Please configure it in your environment to fetch images.";
        } else if (e.message.includes("Pixabay API request failed")) {
            errorMessage = `Failed to fetch images from Pixabay. This could be due to an invalid/expired Pixabay API key, network issues, or a problem with the query. Please check your Pixabay API key configuration. Details: ${e.message}`;
        } else {
            errorMessage = e.message;
        }
      }
      addNotification(errorMessage, "error");
      setIsLoading(false);
    } finally {
      setIsPreparingArticles(false);
    }
  }, [
    postCount, selectedContentType, selectedContentCategory, selectedLanguage, selectedCountryCode, selectedEmotion,
    updateCardState, defaultStyles, addNotification
  ]);


  const handlePromptSubmit = useCallback(async (e: FormEvent) => {
      e.preventDefault();
      if (!userPrompt.trim() || isProcessingPrompt) return;

      setIsProcessingPrompt(true);

      const settingsOptions = {
          postCount: 'A number between 1 and 10.',
          selectedContentType: Object.values(ContentType),
          selectedContentCategory: Object.values(ContentCategory),
          selectedLanguage: Object.keys(LanguageOptions),
          selectedCountryCode: Object.keys(CountryOptions),
          selectedEmotion: Object.keys(Emotions),
          headlineFontFamily: Object.keys(HeadlineFontOptions),
          headlineFontWeight: Object.keys(FontWeightOptions),
          headlineTextAlign: ['left', 'center', 'right'],
          textCase: Object.values(TextCase),
          headerType: Object.values(HeaderType),
      };

      try {
          const result: AiProcessedPrompt = await geminiService.processUserPrompt(userPrompt, settingsOptions);
          
          if (result.action === 'answer_question' && result.answer) {
              addNotification(result.answer, "info");
          }
          
          if (result.action === 'update_settings' && result.settings) {
              // Apply settings with validation
              const { settings } = result;
              let appliedCount = 0;

              // This is a simplified validation block. A real-world scenario might need more robust checks.
              if (settings.postCount && typeof settings.postCount === 'number' && settings.postCount >= 1 && settings.postCount <= 10) { setPostCount(settings.postCount); appliedCount++; }
              if (settings.selectedContentType && Object.values(ContentType).includes(settings.selectedContentType)) { setSelectedContentType(settings.selectedContentType); appliedCount++; }
              if (settings.selectedContentCategory && Object.values(ContentCategory).includes(settings.selectedContentCategory)) { setSelectedContentCategory(settings.selectedContentCategory); appliedCount++; }
              if (settings.selectedEmotion && Object.keys(Emotions).includes(settings.selectedEmotion)) { setSelectedEmotion(settings.selectedEmotion as SelectedEmotion); appliedCount++; }
              if (settings.headlineFontFamily && Object.keys(HeadlineFontOptions).includes(settings.headlineFontFamily)) { handleStyleChange('headlineFontFamily', settings.headlineFontFamily as SelectedHeadlineFontFamily); appliedCount++; }
              if (settings.headlineTextSize && typeof settings.headlineTextSize === 'number') { handleStyleChange('headlineTextSize', settings.headlineTextSize); appliedCount++; }
              if (settings.textCase && Object.values(TextCase).includes(settings.textCase)) { handleStyleChange('textCase', settings.textCase); appliedCount++; }
              
              if(appliedCount > 0) {
                 addNotification(`${appliedCount} setting(s) updated successfully based on your prompt.`, "success");
              } else {
                 addNotification(`I understood you wanted to change settings, but I couldn't apply any changes. Please try rephrasing.`, "info");
              }
          }
          
          if (result.action === 'generate_content' && result.content_prompt) {
              await handleGenerateContent(result.content_prompt);
          }
          setUserPrompt(''); // Clear prompt input on success
      } catch (e: any) {
          console.error("Error processing prompt:", e);
          addNotification(e.message || "Sorry, I couldn't process that request.", "error");
      } finally {
          setIsProcessingPrompt(false);
      }
  }, [userPrompt, isProcessingPrompt, handleGenerateContent, handleStyleChange, addNotification]);


  const handleClearAllContent = useCallback(() => {
    setCards([]);
    setEditingCardId(null);
  }, []);

  const editingCard = useMemo(() => {
    if (!editingCardId) return null;
    const card = cards.find(c => c.id === editingCardId);
    return card?.type === 'news' ? card : null;
  }, [editingCardId, cards]);

  const handleHighlightColorChange = useCallback((index: number, newColor: string) => {
    const colors = (editingCard ? editingCard.style.headlineHighlightColors : defaultStyles.headlineHighlightColors) ?? [];
    const updatedColors = [...colors];
    updatedColors[index] = newColor;
    handleStyleChange('headlineHighlightColors', updatedColors);
  }, [editingCard, defaultStyles, handleStyleChange]);

  const handleAddHighlightColor = useCallback(() => {
    const colors = (editingCard ? editingCard.style.headlineHighlightColors : defaultStyles.headlineHighlightColors) ?? [];
    if (colors.length < MAX_HIGHLIGHT_COLORS) {
      const existingColors = new Set(colors);
      let newColor = '#1EA7FD'; 
      const defaultPalette = ['#FF6B6B', '#4ECDC4', '#45B7D1', '#FED766', '#2AB7CA', '#F0B67F', '#ED553B', '#8A2BE2'];
      for(const color of defaultPalette) {
          if(!existingColors.has(color)) {
              newColor = color;
              break;
          }
      }
      handleStyleChange('headlineHighlightColors', [...colors, newColor]);
    }
  }, [editingCard, defaultStyles, handleStyleChange]);

  const handleRemoveHighlightColor = useCallback((index: number) => {
    const colors = (editingCard ? editingCard.style.headlineHighlightColors : defaultStyles.headlineHighlightColors) ?? [];
    if (colors.length > MIN_HIGHLIGHT_COLORS) {
      const updatedColors = colors.filter((_, i) => i !== index);
      handleStyleChange('headlineHighlightColors', updatedColors);
    }
  }, [editingCard, defaultStyles, handleStyleChange]);

  const handleGenerateAiImageForCard = useCallback(async (articleId: string) => {
    const card = cards.find(c => c.id === articleId);
    if (!card || card.type !== 'news') return;
    const article = card;

    updateCardState(articleId, { isAiImageLoading: true, aiImageError: null, displayState: CardDisplayState.AI_IMAGE_LOADING });
    try {
      const imageUrl = await geminiService.generateAiArticleImage(article.long_headline, selectedLanguage);
      updateCardState(articleId, { aiImageUrl: imageUrl, isAiImageLoading: false, displayState: CardDisplayState.AI_IMAGE_LOADED, localImageUrl: null });
    } catch (e: any) {
        console.error(`Error generating AI image for card ${articleId}:`, e);
        updateCardState(articleId, { 
            isAiImageLoading: false, 
            aiImageError: e.message || "Failed to generate AI image.",
            displayState: CardDisplayState.AI_IMAGE_FAILED
        });
        addNotification(e.message || "Failed to generate AI image.", "error");
    }
  }, [cards, selectedLanguage, updateCardState, addNotification]);

  const handleDownloadCard = useCallback(async (
    cardElement: HTMLElement, 
    article: NewsArticle
  ) => {
    if (!cardElement) return;

    const title = article.long_headline;

    const options = {
      allowTaint: true,
      useCORS: true,
      scale: 4, // High quality scale
      backgroundColor: null,
      logging: false,
      onclone: (clonedDoc: Document) => {
        const clonedCardWrapper = clonedDoc.querySelector('.news-card-wrapper') as HTMLElement | null;
        const clonedCardContainer = clonedDoc.querySelector('.card-container') as HTMLElement | null;
        
        if (clonedCardWrapper && clonedCardContainer && article.style.outlineEnabled) {
          // Remove the live 'outline' from the wrapper as it's not captured well
          clonedCardWrapper.style.outline = 'none';
          clonedCardWrapper.style.outlineOffset = '0';
          
          // Apply a 'border' to the inner container which has the background and is more stable
          clonedCardContainer.style.border = `${article.style.outlineWidth}px ${article.style.outlineType} ${article.style.outlineColor}`;
        }

        // Remove controls from the downloaded image
        const elementsToRemove = clonedDoc.querySelectorAll('.no-screenshot');
        elementsToRemove?.forEach(el => ((el as HTMLElement).style.display = 'none'));
      },
    };

    try {
      const canvas = await html2canvas(cardElement, options);
      const dataUrl = canvas.toDataURL('image/jpeg', 1.0);
      
      const link = document.createElement('a');
      link.download = `${title.replace(/[^a-z0-9]/gi, '_').toLowerCase() || 'content-card'}.jpeg`;
      link.href = dataUrl;
      document.body.appendChild(link);
      link.click();
      document.body.removeChild(link);
    } catch (error) {
      console.error('Error generating image from card:', error);
      addNotification('Could not download image. See console for details.', 'error');
    }
  }, [addNotification]);

  const handleDownloadViralPost = useCallback(async (
    cardElement: HTMLElement, 
    title: string
  ) => {
    if (!cardElement) return;

    const options = {
      allowTaint: true,
      useCORS: true,
      scale: 4, 
      backgroundColor: null, 
      logging: false,
    };

    try {
      const canvas = await html2canvas(cardElement, options);
      const dataUrl = canvas.toDataURL('image/jpeg', 1.0);
      
      const link = document.createElement('a');
      link.download = `${title.replace(/[^a-z0-9]/gi, '_').toLowerCase() || 'viral-post'}.jpeg`;
      link.href = dataUrl;
      document.body.appendChild(link);
      link.click();
      document.body.removeChild(link);
    } catch (error) {
      console.error('Error generating image from viral post:', error);
      addNotification('Could not download image. See console for details.', 'error');
    }
  }, [addNotification]);

  const handleDownloadAll = useCallback(async () => {
    setIsDownloadingAll(true);
    try {
        for (let i = 0; i < cards.length; i++) {
            const card = cards[i];
            const element = document.querySelector(`[data-card-id="${card.id}"]`) as HTMLElement;

            if (element) {
                const canvas = await html2canvas(element, {
                    allowTaint: true,
                    useCORS: true,
                    scale: 4,
                    backgroundColor: null,
                    logging: false,
                    onclone: (clonedDoc: Document) => {
                        const clonedEl = clonedDoc.querySelector(`[data-card-id="${card.id}"]`) as HTMLElement | null;
                        if (!clonedEl) return;
                        
                        if (card.type === 'news') {
                           const wrapperEl = clonedEl.querySelector('.news-card-wrapper') as HTMLElement | null;
                           const containerEl = clonedEl.querySelector('.card-container') as HTMLElement | null;
                           if (wrapperEl && containerEl && card.style.outlineEnabled) {
                               wrapperEl.style.outline = 'none';
                               wrapperEl.style.outlineOffset = '0';
                               containerEl.style.border = `${card.style.outlineWidth}px ${card.style.outlineType} ${card.style.outlineColor}`;
                           }
                        }

                        const elementsToRemove = clonedEl.querySelectorAll('.no-screenshot');
                        elementsToRemove?.forEach(el => ((el as HTMLElement).style.display = 'none'));
                    }
                });
                const dataUrl = canvas.toDataURL('image/jpeg', 1.0);
                const base64Data = dataUrl.split(',')[1];
                
                const title = card.type === 'news' ? card.long_headline : card.topic;
                const fileName = `${(title || `card_${i+1}`).replace(/[^a-z0-9]/gi, '_').toLowerCase()}.jpeg`;
                const zip = new JSZip();
                zip.file(fileName, base64Data, { base64: true });
                const zipBlob = await zip.generateAsync({ type: 'blob' });

                const link = document.createElement('a');
                link.download = `content_cards_jpeg.zip`;
                link.href = URL.createObjectURL(zipBlob);
                document.body.appendChild(link);
                link.click();
                document.body.removeChild(link);
                URL.revokeObjectURL(link.href);
            }
        }
    } catch (error) {
        console.error('Error zipping and downloading all cards:', error);
        addNotification('Failed to download all cards. See console for details.', 'error');
    } finally {
        setIsDownloadingAll(false);
    }
  }, [cards, addNotification]);

  const AccordionSection = ({ title, isOpen, setIsOpen, children }: { title: string, isOpen: boolean, setIsOpen: (isOpen: boolean) => void, children: React.ReactNode }) => (
    <div className="border-b border-gray-200 dark:border-gray-700 last:border-b-0">
      <button
        onClick={() => setIsOpen(!isOpen)}
        className="w-full flex justify-between items-center p-3 text-left font-semibold text-gray-800 dark:text-gray-200 hover:bg-gray-100 dark:hover:bg-gray-750 transition-colors focus:outline-none focus-visible:ring-2 focus-visible:ring-primary"
      >
        <span>{title}</span>
        {isOpen ? <ChevronUpIcon className="w-5 h-5" /> : <ChevronDownIcon className="w-5 h-5" />}
      </button>
      {isOpen && <div className="p-4 bg-gray-50 dark:bg-gray-800">{children}</div>}
    </div>
  );

  const FormRow = ({ label, children, helpText }: { label: string, children: React.ReactNode, helpText?: string }) => (
      <div className="grid grid-cols-12 gap-2 items-center mb-3">
          <label className="col-span-4 text-sm font-medium text-gray-700 dark:text-gray-300">{label}</label>
          <div className="col-span-8">
            {children}
            {helpText && <p className="text-xs text-gray-500 dark:text-gray-400 mt-1">{helpText}</p>}
          </div>
      </div>
  );
  
  const toggleEditAll = useCallback(() => {
    const nextState = !isEditingAll;
    setIsEditingAll(nextState);
    if (nextState) {
        setEditingCardId(null); // Deselect any single card
    }
  }, [isEditingAll]);

  const handleSelectCardForEditing = useCallback((cardId: string) => {
    setIsEditingAll(false); // Turn off bulk edit mode
    setEditingCardId(prevId => (prevId === cardId ? null : cardId));
  }, []);

  const sidebarContent = useMemo(() => {
    const stylesForSidebar = isEditingAll ? defaultStyles : (editingCard?.style ?? defaultStyles);
    const highlightColorsForSidebar = stylesForSidebar.headlineHighlightColors;

    const sidebarHeader = (
      <div className="p-3 bg-gray-100 dark:bg-gray-900 border-b border-gray-200 dark:border-gray-700">
        {isEditingAll ? (
           <div>
             <p className="text-sm font-semibold text-primary text-center">
               Bulk Editing All Cards
             </p>
             <button
               onClick={toggleEditAll}
               className="w-full mt-2 text-sm py-1 px-2 rounded-md bg-primary text-primary-text hover:bg-primary-hover"
             >
               Finish Bulk Editing
             </button>
           </div>
        ) : editingCard ? (
          <div>
            <p className="text-sm font-semibold text-primary truncate">
              Editing: <span className="text-gray-800 dark:text-gray-200 font-normal">{editingCard.long_headline}</span>
            </p>
            <button 
              onClick={() => setEditingCardId(null)}
              className="w-full mt-2 text-sm py-1 px-2 rounded-md bg-primary text-primary-text hover:bg-primary-hover"
            >
              Finish Editing Card
            </button>
          </div>
        ) : (
          <p className="font-semibold text-gray-700 dark:text-gray-300 text-center">
            Default Card Settings
          </p>
        )}
      </div>
    );

    return (
    <div>
      {sidebarHeader}
      <AccordionSection title="General Settings" isOpen={isGeneralSettingsOpen} setIsOpen={setIsGeneralSettingsOpen}>
          <FormRow label="Content Type">
              <select id="contentType" value={selectedContentType} onChange={e => setSelectedContentType(e.target.value as ContentType)} className="w-full p-2 border rounded-md bg-white dark:bg-gray-700 dark:border-gray-600">
                  {Object.values(ContentType).map(type => <option key={type} value={type}>{type.charAt(0).toUpperCase() + type.slice(1)}</option>)}
              </select>
          </FormRow>
          <FormRow label="Category">
              <select id="contentCategory" value={selectedContentCategory} onChange={e => setSelectedContentCategory(e.target.value as ContentCategoryValue)} className="w-full p-2 border rounded-md bg-white dark:bg-gray-700 dark:border-gray-600">
                  {Object.values(ContentCategory).map(cat => <option key={cat} value={cat}>{cat}</option>)}
              </select>
          </FormRow>
          <FormRow label="Emotion">
              <select id="emotion" value={selectedEmotion} onChange={e => setSelectedEmotion(e.target.value as SelectedEmotion)} className="w-full p-2 border rounded-md bg-white dark:bg-gray-700 dark:border-gray-600">
                  {Object.entries(Emotions).map(([key, name]) => <option key={key} value={key}>{name}</option>)}
              </select>
          </FormRow>
          <FormRow label="Language">
              <select id="language" value={selectedLanguage} onChange={e => setSelectedLanguage(e.target.value as SelectedLanguageCode)} className="w-full p-2 border rounded-md bg-white dark:bg-gray-700 dark:border-gray-600">
                  {Object.entries(LanguageOptions).map(([code, name]) => <option key={code} value={code}>{name}</option>)}
              </select>
          </FormRow>
          <FormRow label="Country">
              <select id="country" value={selectedCountryCode} onChange={e => setSelectedCountryCode(e.target.value as SelectedCountryCode)} className="w-full p-2 border rounded-md bg-white dark:bg-gray-700 dark:border-gray-600">
                  {Object.entries(CountryOptions).map(([code, name]) => <option key={code} value={code}>{name}</option>)}
              </select>
          </FormRow>
          <FormRow label="# of Posts">
              <input type="number" id="postCount" value={postCount} min="1" max="10" onChange={e => setPostCount(parseInt(e.target.value))} className="w-full p-2 border rounded-md bg-white dark:bg-gray-700 dark:border-gray-600" />
          </FormRow>
      </AccordionSection>
      <AccordionSection title="Header & Headline" isOpen={isHeadlineSettingsOpen} setIsOpen={setIsHeadlineSettingsOpen}>
          <FormRow label="Header Type">
              <div className="flex items-center gap-4">
                  <label><input type="radio" value={HeaderType.Solid} checked={stylesForSidebar.headerType === HeaderType.Solid} onChange={() => handleStyleChange('headerType', HeaderType.Solid)} /> Solid</label>
                  <label><input type="radio" value={HeaderType.Gradient} checked={stylesForSidebar.headerType === HeaderType.Gradient} onChange={() => handleStyleChange('headerType', HeaderType.Gradient)} /> Gradient</label>
              </div>
          </FormRow>
          {stylesForSidebar.headerType === HeaderType.Solid && (
              <FormRow label="Header Color">
                  <CustomColorPicker
                    label="Header color"
                    value={stylesForSidebar.selectedHeaderColor}
                    onChange={(color) => handleStyleChange('selectedHeaderColor', color)}
                    isOpen={activeColorPicker === 'headerSolid'}
                    onToggle={() => handleColorPickerToggle('headerSolid')}
                  />
              </FormRow>
          )}
          {stylesForSidebar.headerType === HeaderType.Gradient && (
              <>
                  <FormRow label="Direction">
                      <select id="gradientDirection" value={stylesForSidebar.headerGradientDirection} onChange={e => handleStyleChange('headerGradientDirection', e.target.value as GradientDirection)} className="w-full p-2 border rounded-md bg-white dark:bg-gray-700 dark:border-gray-600">
                          {Object.entries(GradientDirectionOptions).map(([val, name]) => <option key={val} value={val}>{name}</option>)}
                      </select>
                  </FormRow>
                  <FormRow label="Color 1">
                      <CustomColorPicker
                        label="Gradient color 1"
                        value={stylesForSidebar.headerGradientColor1}
                        onChange={(color) => handleStyleChange('headerGradientColor1', color)}
                        isOpen={activeColorPicker === 'headerGradient1'}
                        onToggle={() => handleColorPickerToggle('headerGradient1')}
                      />
                  </FormRow>
                  <FormRow label="Color 2">
                      <CustomColorPicker
                        label="Gradient color 2"
                        value={stylesForSidebar.headerGradientColor2}
                        onChange={(color) => handleStyleChange('headerGradientColor2', color)}
                        isOpen={activeColorPicker === 'headerGradient2'}
                        onToggle={() => handleColorPickerToggle('headerGradient2')}
                      />
                  </FormRow>
              </>
          )}
          <hr className="my-4 border-gray-300 dark:border-gray-600"/>
          <FormRow label="Font Family">
              <select id="headlineFont" value={stylesForSidebar.headlineFontFamily} onChange={e => handleStyleChange('headlineFontFamily', e.target.value as SelectedHeadlineFontFamily)} className="w-full p-2 border rounded-md bg-white dark:bg-gray-700 dark:border-gray-600">
                  {Object.entries(HeadlineFontOptions).map(([val, name]) => <option key={val} value={val} style={{fontFamily: val}}>{name}</option>)}
              </select>
          </FormRow>
          <FormRow label="Font Weight">
              <select id="headlineWeight" value={stylesForSidebar.headlineFontWeight} onChange={e => handleStyleChange('headlineFontWeight', e.target.value as SelectedFontWeight)} className="w-full p-2 border rounded-md bg-white dark:bg-gray-700 dark:border-gray-600">
                  {Object.entries(FontWeightOptions).map(([val, name]) => <option key={val} value={val}>{name}</option>)}
              </select>
          </FormRow>
          <FormRow label="Font Size" helpText="Value in pixels (px).">
              <input type="range" id="headlineSize" value={stylesForSidebar.headlineTextSize} min="12" max="80" onChange={e => handleStyleChange('headlineTextSize', parseInt(e.target.value))} className="w-full" />
              <span className="text-xs">{stylesForSidebar.headlineTextSize}px</span>
          </FormRow>
          <FormRow label="Text Align">
            <div className="flex justify-around">
              {(['left', 'center', 'right'] as TextAlign[]).map(align => (
                <label key={align}><input type="radio" value={align} checked={stylesForSidebar.headlineTextAlign === align} onChange={() => handleStyleChange('headlineTextAlign', align)} /> {align.charAt(0).toUpperCase() + align.slice(1)}</label>
              ))}
            </div>
          </FormRow>
          <FormRow label="Text Width" helpText="Percentage of header width.">
              <input type="range" id="headlineWidth" value={stylesForSidebar.headlineTextWidth} min="50" max="100" onChange={e => handleStyleChange('headlineTextWidth', parseInt(e.target.value))} className="w-full" />
              <span className="text-xs">{stylesForSidebar.headlineTextWidth}%</span>
          </FormRow>
          <FormRow label="Letter Spacing" helpText="Value in pixels (px).">
              <input type="range" id="letterSpacing" value={stylesForSidebar.headlineLetterSpacing} min="-2" max="10" step="0.5" onChange={e => handleStyleChange('headlineLetterSpacing', parseFloat(e.target.value))} className="w-full" />
              <span className="text-xs">{stylesForSidebar.headlineLetterSpacing}px</span>
          </FormRow>
           <FormRow label="Line Height" helpText="Multiplier of font size.">
              <input type="range" id="lineHeight" value={stylesForSidebar.headlineLineHeight} min="0.8" max="3" step="0.1" onChange={e => handleStyleChange('headlineLineHeight', parseFloat(e.target.value))} className="w-full" />
              <span className="text-xs">{stylesForSidebar.headlineLineHeight}</span>
          </FormRow>
      </AccordionSection>
      <AccordionSection title="Highlight Colors" isOpen={isHighlightColorsSettingsOpen} setIsOpen={setIsHighlightColorsSettingsOpen}>
          <div className="space-y-2">
            {highlightColorsForSidebar.map((color, index) => (
              <div key={index} className="flex items-center gap-2">
                <CustomColorPicker
                    label={`Highlight color ${index + 1}`}
                    value={color}
                    onChange={(newColor) => handleHighlightColorChange(index, newColor)}
                    isOpen={activeColorPicker === `highlight-${index}`}
                    onToggle={() => handleColorPickerToggle(`highlight-${index}`)}
                    className="flex-grow"
                />
                <button onClick={() => handleRemoveHighlightColor(index)} disabled={highlightColorsForSidebar.length <= MIN_HIGHLIGHT_COLORS} className="p-1 text-red-600 hover:text-red-800 disabled:opacity-50"><TrashIcon className="w-4 h-4"/></button>
              </div>
            ))}
            <button onClick={handleAddHighlightColor} disabled={highlightColorsForSidebar.length >= MAX_HIGHLIGHT_COLORS} className="w-full mt-2 p-2 text-sm bg-blue-500 text-white rounded-md hover:bg-blue-600 disabled:bg-gray-400">Add Color</button>
          </div>
      </AccordionSection>
      <AccordionSection title="Summary Text" isOpen={isSummarySettingsOpen} setIsOpen={setIsSummarySettingsOpen}>
        <FormRow label="Show Summary">
          <input type="checkbox" checked={stylesForSidebar.showSummary} onChange={e => handleStyleChange('showSummary', e.target.checked)} />
        </FormRow>
        <FormRow label="Show Sources">
          <input type="checkbox" checked={stylesForSidebar.showSources} onChange={e => handleStyleChange('showSources', e.target.checked)} />
        </FormRow>
        <FormRow label="Text Transform">
          <select id="textCase" value={stylesForSidebar.textCase} onChange={e => handleStyleChange('textCase', e.target.value as TextCase)} className="w-full p-2 border rounded-md bg-white dark:bg-gray-700 dark:border-gray-600">
            {Object.values(TextCase).map(tc => <option key={tc} value={tc}>{tc.charAt(0).toUpperCase() + tc.slice(1)}</option>)}
          </select>
        </FormRow>
        <FormRow label="Font Size">
          <select id="summarySize" value={stylesForSidebar.summaryFontSizeKey} onChange={e => handleStyleChange('summaryFontSizeKey', e.target.value as FontSizeKey)} className="w-full p-2 border rounded-md bg-white dark:bg-gray-700 dark:border-gray-600">
            {Object.keys(FontSizeOptions).map(key => <option key={key} value={key}>{key.charAt(0).toUpperCase() + key.slice(1)}</option>)}
          </select>
        </FormRow>
      </AccordionSection>
      <AccordionSection title="Card Outline" isOpen={isCardOutlineSettingsOpen} setIsOpen={setIsCardOutlineSettingsOpen}>
        <FormRow label="Enable Outline">
            <input type="checkbox" checked={stylesForSidebar.outlineEnabled} onChange={e => handleStyleChange('outlineEnabled', e.target.checked)} />
        </FormRow>
        {stylesForSidebar.outlineEnabled && (<>
          <FormRow label="Color">
              <CustomColorPicker
                label="Outline color"
                value={stylesForSidebar.outlineColor}
                onChange={(color) => handleStyleChange('outlineColor', color)}
                isOpen={activeColorPicker === 'outlineColor'}
                onToggle={() => handleColorPickerToggle('outlineColor')}
              />
          </FormRow>
          <FormRow label="Type">
              <select id="outlineType" value={stylesForSidebar.outlineType} onChange={e => handleStyleChange('outlineType', e.target.value as OutlineType)} className="w-full p-2 border rounded-md bg-white dark:bg-gray-700 dark:border-gray-600">
                  {Object.values(OutlineType).map(type => <option key={type} value={type}>{type.charAt(0).toUpperCase() + type.slice(1)}</option>)}
              </select>
          </FormRow>
          <FormRow label="Width" helpText="Value in pixels (px).">
              <input type="range" id="outlineWidth" value={stylesForSidebar.outlineWidth} min="1" max="20" onChange={e => handleStyleChange('outlineWidth', parseInt(e.target.value))} className="w-full" />
              <span className="text-xs">{stylesForSidebar.outlineWidth}px</span>
          </FormRow>
          <FormRow label="Corner Radius" helpText="Value in pixels (px).">
              <input type="range" id="outlineRadius" value={stylesForSidebar.outlineRoundedCorners} min="0" max="50" onChange={e => handleStyleChange('outlineRoundedCorners', parseInt(e.target.value))} className="w-full" />
              <span className="text-xs">{stylesForSidebar.outlineRoundedCorners}px</span>
          </FormRow>
          <FormRow label="Offset" helpText="Value in pixels (px).">
              <input type="range" id="outlineOffset" value={stylesForSidebar.outlineOffset} min="-20" max="20" onChange={e => handleStyleChange('outlineOffset', parseInt(e.target.value))} className="w-full" />
              <span className="text-xs">{stylesForSidebar.outlineOffset}px</span>
          </FormRow>
        </>)}
      </AccordionSection>
      <AccordionSection title="Image Overlay" isOpen={isImageOverlaySettingsOpen} setIsOpen={setIsImageOverlaySettingsOpen}>
        <FormRow label="Show Overlay">
          <input type="checkbox" checked={stylesForSidebar.overlayVisible} onChange={e => handleStyleChange('overlayVisible', e.target.checked)} />
        </FormRow>
        {stylesForSidebar.overlayVisible && (<>
          <FormRow label="Position">
            <div className="flex justify-between items-center text-gray-700 dark:text-gray-300">
              <button onClick={() => handleStyleChange('overlayPosition', 'top')} title="Top"><OverlayTopIcon isActive={stylesForSidebar.overlayPosition==='top'}/></button>
              <button onClick={() => handleStyleChange('overlayPosition', 'bottom')} title="Bottom"><OverlayBottomIcon isActive={stylesForSidebar.overlayPosition==='bottom'}/></button>
              <button onClick={() => handleStyleChange('overlayPosition', 'left')} title="Left"><OverlayLeftIcon isActive={stylesForSidebar.overlayPosition==='left'}/></button>
              <button onClick={() => handleStyleChange('overlayPosition', 'right')} title="Right"><OverlayRightIcon isActive={stylesForSidebar.overlayPosition==='right'}/></button>
            </div>
          </FormRow>
          <FormRow label="Type">
            <div className="flex items-center gap-4">
              <label><input type="radio" value="gradient" checked={!stylesForSidebar.overlayIsSolid} onChange={() => handleStyleChange('overlayIsSolid', false)} /> Gradient</label>
              <label><input type="radio" value="solid" checked={stylesForSidebar.overlayIsSolid} onChange={() => handleStyleChange('overlayIsSolid', true)} /> Solid</label>
            </div>
          </FormRow>
          <FormRow label="Color">
              <CustomColorPicker
                label="Overlay background color"
                value={stylesForSidebar.overlayBackgroundColor}
                onChange={(color) => handleStyleChange('overlayBackgroundColor', color)}
                isOpen={activeColorPicker === 'overlayBgColor'}
                onToggle={() => handleColorPickerToggle('overlayBgColor')}
              />
          </FormRow>
          <FormRow label="Height/Width" helpText="Percentage of image dimension.">
            <input type="range" id="overlayHeight" value={stylesForSidebar.overlayHeight} min="10" max="100" onChange={e => handleStyleChange('overlayHeight', parseInt(e.target.value))} className="w-full" />
            <span className="text-xs">{stylesForSidebar.overlayHeight}%</span>
          </FormRow>
          <hr className="my-4 border-gray-300 dark:border-gray-600"/>
          <FormRow label="Enable Border">
            <input type="checkbox" checked={stylesForSidebar.overlayOneSideBorderEnabled} onChange={e => handleStyleChange('overlayOneSideBorderEnabled', e.target.checked)} />
          </FormRow>
          {stylesForSidebar.overlayOneSideBorderEnabled && (<>
            <FormRow label="Border Position">
                <select value={stylesForSidebar.overlayBorderPosition} onChange={e => handleStyleChange('overlayBorderPosition', e.target.value as OverlayBorderPosition)} className="w-full p-2 border rounded-md bg-white dark:bg-gray-700 dark:border-gray-600">
                    {(['top','bottom','left','right'] as OverlayBorderPosition[]).map(p => <option key={p} value={p}>{p.charAt(0).toUpperCase()+p.slice(1)}</option>)}
                </select>
            </FormRow>
            <FormRow label="Border Color">
              <CustomColorPicker
                label="Overlay border color"
                value={stylesForSidebar.overlayBorderColor}
                onChange={(color) => handleStyleChange('overlayBorderColor', color)}
                isOpen={activeColorPicker === 'overlayBorderColor'}
                onToggle={() => handleColorPickerToggle('overlayBorderColor')}
              />
            </FormRow>
            <FormRow label="Border Width" helpText="Value in pixels (px).">
                <input type="range" id="overlayBorderWidth" value={stylesForSidebar.overlayBorderWidth} min="1" max="10" onChange={e => handleStyleChange('overlayBorderWidth', parseInt(e.target.value))} className="w-full" />
                <span className="text-xs">{stylesForSidebar.overlayBorderWidth}px</span>
            </FormRow>
          </>)}
        </>)}
      </AccordionSection>
    </div>
    )
  }, [
    isGeneralSettingsOpen, selectedContentType, selectedContentCategory, selectedLanguage, selectedCountryCode, selectedEmotion, postCount,
    isHeadlineSettingsOpen, isHighlightColorsSettingsOpen, isSummarySettingsOpen, isCardOutlineSettingsOpen, isImageOverlaySettingsOpen,
    handleHighlightColorChange, handleAddHighlightColor, handleRemoveHighlightColor,
    handleStyleChange, editingCard, setEditingCardId, isEditingAll, defaultStyles, toggleEditAll,
    activeColorPicker, handleColorPickerToggle
  ]);
  
  useEffect(() => {
    setSidebarControls(sidebarContent);

    // Clean up sidebar controls when this page unmounts
    return () => {
      setSidebarControls(null);
    };
  }, [sidebarContent, setSidebarControls]);

  const handleGenerateViralPost = useCallback(async (topic: string) => {
    setIsViralPostModalOpen(false);
    const newPostId = `${Date.now()}-viral-${Math.random().toString(16).slice(2)}`;
    const newPost: CardData = {
      type: 'viral',
      id: newPostId,
      topic: topic,
      headline: 'Generating...',
      summary: `Creating a viral post for "${topic}"`,
      imageUrl: null,
      isLoading: true,
      error: null,
    };
    setCards(prev => [...prev, newPost]);
    
    try {
        const content = await geminiService.generateViralPostContent(topic);
        updateCardState(newPostId, { 
            headline: content.headline, 
            summary: content.summary,
        });

        const imageUrl = await geminiService.generateViralImage(content.image_prompt);
        updateCardState(newPostId, { imageUrl, isLoading: false });
        addNotification(`Viral post for "${topic}" generated successfully!`, 'success');

    } catch(e: any) {
        console.error("Error generating viral post:", e);
        const errorMessage = e.message || "Failed to generate viral post.";
        updateCardState(newPostId, { error: errorMessage, isLoading: false });
        addNotification(`Failed to generate viral post on "${topic}": ${errorMessage}`, "error");
    }
  }, [updateCardState, addNotification]);

  return (
    <>
      <div className="flex flex-wrap items-center justify-between gap-4 mb-6">
        <div className="flex-grow">
            <h1 className="text-3xl font-bold text-gray-800 dark:text-gray-100">AI Content Generator</h1>
            <p className="text-gray-600 dark:text-gray-400 mt-1">
                Create engaging news cards or viral posts with AI.
            </p>
        </div>
        <div className="flex items-center gap-4">
            <button onClick={toggleGlobalTheme} className="p-2 rounded-full text-gray-600 dark:text-gray-300 hover:bg-gray-200 dark:hover:bg-gray-700 transition-colors" aria-label="Toggle theme">
                {globalTheme === 'light' ? <MoonIcon/> : <SunIcon/>}
            </button>
            <button onClick={() => setIsThemePanelOpen(true)} className="p-2 rounded-full text-gray-600 dark:text-gray-300 hover:bg-gray-200 dark:hover:bg-gray-700 transition-colors" aria-label="Customize theme">
                <PaletteIcon />
            </button>
        </div>
      </div>
      
      <div className="bg-white/80 dark:bg-gray-800/80 backdrop-blur-sm shadow-lg rounded-xl p-4 mb-6 sticky top-2 z-20 border border-gray-200 dark:border-gray-700/50">
          <form onSubmit={handlePromptSubmit} className="flex flex-col sm:flex-row items-center gap-4">
              <input
                  type="text"
                  value={userPrompt}
                  onChange={(e) => setUserPrompt(e.target.value)}
                  placeholder="Tell me what to do... e.g., 'Make the headline font Khand' or 'Generate 5 facts about space'"
                  className="w-full flex-grow p-2.5 border rounded-md bg-white dark:bg-gray-700 dark:border-gray-600 focus:ring-2 focus:ring-primary focus:border-primary transition-all"
                  disabled={isProcessingPrompt || isLoading}
              />
              <button
                  type="submit"
                  disabled={isProcessingPrompt || isLoading || !userPrompt.trim()}
                  className="px-5 py-2.5 bg-primary text-primary-text font-semibold rounded-md hover:bg-primary-hover shadow-md hover:shadow-lg transition-all transform hover:-translate-y-px disabled:opacity-50 disabled:cursor-not-allowed flex items-center justify-center gap-2 w-full sm:w-auto"
              >
                  {isProcessingPrompt ? <Spinner size="sm" color="text-white"/> : <GenerateIcon className="w-5 h-5" />}
                  <span>{isProcessingPrompt ? 'Thinking...' : 'Submit'}</span>
              </button>
          </form>
          <div className="mt-4 flex flex-col sm:flex-row items-center justify-between gap-4">
              <p className="text-sm text-gray-600 dark:text-gray-300 flex-grow text-center sm:text-left">Or use the sidebar and buttons below for manual control.</p>
              <div className="flex-shrink-0 flex flex-wrap items-center justify-center gap-2">
                {cards.length > 0 && (
                  <>
                    <button
                        onClick={toggleEditAll}
                        className={`px-4 py-2 rounded-md text-white flex items-center gap-2 transition-all transform hover:-translate-y-px shadow-md hover:shadow-lg ${
                            isEditingAll
                                ? 'bg-blue-700 hover:bg-blue-800'
                                : 'bg-yellow-500 hover:bg-yellow-600'
                        }`}
                    >
                        <EditIcon className="w-5 h-5" />
                        <span>{isEditingAll ? 'Finish Bulk Edit' : 'Edit All Cards'}</span>
                    </button>
                    <button
                        onClick={handleDownloadAll}
                        disabled={isDownloadingAll}
                        className="px-4 py-2 bg-green-600 text-white rounded-md hover:bg-green-700 disabled:bg-green-400 flex items-center gap-2 transition-all transform hover:-translate-y-px shadow-md hover:shadow-lg"
                    >
                        {isDownloadingAll ? <Spinner size="sm" color="text-white"/> : <DownloadAllIcon className="w-5 h-5" />}
                        <span>{isDownloadingAll ? 'Zipping...' : 'Download All'}</span>
                    </button>
                    <button
                        onClick={handleClearAllContent}
                        className="px-4 py-2 bg-red-600 text-white rounded-md hover:bg-red-700 disabled:bg-red-400 flex items-center gap-2 transition-all transform hover:-translate-y-px shadow-md hover:shadow-lg"
                    >
                        <TrashIcon className="w-5 h-5" />
                        <span>Clear All</span>
                    </button>
                  </>
                )}
                 <button
                    onClick={() => setIsViralPostModalOpen(true)}
                    disabled={isLoading || isProcessingPrompt}
                    className="px-4 py-2 bg-gradient-to-r from-purple-500 to-pink-500 text-white font-semibold rounded-md hover:from-purple-600 hover:to-pink-600 shadow-md hover:shadow-lg transition-all transform hover:-translate-y-px disabled:opacity-50 disabled:cursor-not-allowed flex items-center gap-2"
                >
                    <GenerateIcon className="w-5 h-5" />
                    <span>Generate Viral Post</span>
                </button>
                <button
                    onClick={() => handleGenerateContent()}
                    disabled={isLoading || isProcessingPrompt}
                    className="px-4 py-2 bg-gradient-to-r from-indigo-500 to-purple-500 text-white font-semibold rounded-md hover:from-indigo-600 hover:to-purple-600 shadow-md hover:shadow-lg transition-all transform hover:-translate-y-px disabled:opacity-50 disabled:cursor-not-allowed flex items-center gap-2"
                >
                    {isLoading ? <Spinner size="sm" color="text-white"/> : <GenerateIcon className="w-5 h-5" />}
                    <span>{isLoading ? (isPreparingArticles ? 'Preparing...' : 'Generating...') : (cards.length > 0 ? 'Generate More' : 'Generate')}</span>
                </button>
              </div>
          </div>
      </div>

      {cards.length === 0 && !isLoading && (
        <div className="text-center py-20 bg-white dark:bg-gray-800 rounded-lg shadow-md">
            <h2 className="text-2xl font-semibold text-gray-700 dark:text-gray-200">Welcome!</h2>
            <p className="mt-2 text-gray-500 dark:text-gray-400">Use the prompt bar or click a "Generate" button to create content.</p>
        </div>
      )}
      
      {isLoading && cards.length === 0 && (
          <div className="text-center py-20">
              <Spinner size="lg" color="text-primary"/>
              <p className="mt-4 text-gray-600 dark:text-gray-300">Generating initial content, please wait...</p>
          </div>
      )}

      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
        {cards.map((card) => (
          <div key={card.id} data-card-id={card.id}>
            {card.type === 'news' ? (
                <NewsCard
                    article={card}
                    onDownload={handleDownloadCard}
                    onGenerateAiImage={handleGenerateAiImageForCard}
                    onUploadImage={handleLocalImageUpload}
                    onEdit={handleSelectCardForEditing}
                    editingCardId={editingCardId}
                    isEditingAll={isEditingAll}
                />
            ) : (
                <ViralPostCard 
                    post={card}
                    onDownload={handleDownloadViralPost}
                />
            )}
          </div>
        ))}
      </div>
      
      {isViralPostModalOpen && (
        <ViralPostGeneratorModal
          isOpen={isViralPostModalOpen}
          onClose={() => setIsViralPostModalOpen(false)}
          onGenerate={handleGenerateViralPost}
        />
      )}

      {isThemePanelOpen && (
        <div className="fixed inset-0 bg-black/40 z-40" onClick={() => setIsThemePanelOpen(false)}></div>
      )}
      <div className={`fixed top-0 right-0 h-full w-96 bg-white dark:bg-gray-800 shadow-2xl z-50 transform transition-transform duration-300 ease-in-out ${isThemePanelOpen ? 'translate-x-0' : 'translate-x-full'}`}>
        <div className="flex justify-between items-center p-4 border-b dark:border-gray-700">
          <h2 className="text-lg font-semibold">Customize Theme</h2>
          <button onClick={() => setIsThemePanelOpen(false)}><CloseIcon /></button>
        </div>
        <div className="p-4 space-y-4">
          <FormRow label="Primary Color">
            <CustomColorPicker
              label="Primary theme color"
              value={themeSettings.primaryColor}
              onChange={(color) => handleThemeSettingChange('primaryColor', color)}
              isOpen={activeColorPicker === 'themePrimary'}
              onToggle={() => handleColorPickerToggle('themePrimary')}
            />
          </FormRow>
          <FormRow label="Global Font">
            <select value={themeSettings.globalFontFamily} onChange={e => handleThemeSettingChange('globalFontFamily', e.target.value as SelectedGlobalFontFamily)} className="w-full p-2 border rounded-md bg-white dark:bg-gray-700 dark:border-gray-600">
              {Object.entries(GlobalFontOptions).map(([val, name]) => <option key={val} value={val}>{name}</option>)}
            </select>
          </FormRow>
          <FormRow label="Background Type">
            <div className="flex items-center gap-4">
              <label><input type="radio" value="solid" checked={themeSettings.backgroundType === 'solid'} onChange={() => handleThemeSettingChange('backgroundType', 'solid')} /> Solid</label>
              <label><input type="radio" value="gradient" checked={themeSettings.backgroundType === 'gradient'} onChange={() => handleThemeSettingChange('backgroundType', 'gradient')} /> Gradient</label>
            </div>
          </FormRow>
          {themeSettings.backgroundType === 'solid' ? (
            <FormRow label="BG Color">
              <CustomColorPicker
                label="Background solid color"
                value={themeSettings.backgroundSolidColor}
                onChange={(color) => handleThemeSettingChange('backgroundSolidColor', color)}
                isOpen={activeColorPicker === 'themeBgSolid'}
                onToggle={() => handleColorPickerToggle('themeBgSolid')}
              />
            </FormRow>
          ) : (
            <>
              <FormRow label="BG Gradient Dir.">
                <select value={themeSettings.backgroundGradientDirection} onChange={e => handleThemeSettingChange('backgroundGradientDirection', e.target.value as GradientDirection)} className="w-full p-2 border rounded-md bg-white dark:bg-gray-700 dark:border-gray-600">
                  {Object.entries(GradientDirectionOptions).map(([val, name]) => <option key={val} value={val}>{name}</option>)}
                </select>
              </FormRow>
              <FormRow label="BG Gradient Start">
                 <CustomColorPicker
                    label="Background gradient start color"
                    value={themeSettings.backgroundGradientStart}
                    onChange={(color) => handleThemeSettingChange('backgroundGradientStart', color)}
                    isOpen={activeColorPicker === 'themeBgGradStart'}
                    onToggle={() => handleColorPickerToggle('themeBgGradStart')}
                  />
              </FormRow>
              <FormRow label="BG Gradient End">
                 <CustomColorPicker
                    label="Background gradient end color"
                    value={themeSettings.backgroundGradientEnd}
                    onChange={(color) => handleThemeSettingChange('backgroundGradientEnd', color)}
                    isOpen={activeColorPicker === 'themeBgGradEnd'}
                    onToggle={() => handleColorPickerToggle('themeBgGradEnd')}
                  />
              </FormRow>
            </>
          )}
        </div>
      </div>
    </>
  );
};

const ViralPostGeneratorModal: React.FC<{
  isOpen: boolean;
  onClose: () => void;
  onGenerate: (topic: string) => void;
}> = ({ isOpen, onClose, onGenerate }) => {
    const [topic, setTopic] = useState('');
    const sampleTopics = [
        "Love Jihad", "Fake Babas", "Youth selling kidneys for iPhones", 
        "Viral Marriage Drama", "Village banishes daughter-in-law", "Liquor tragedy in Bihar", 
        "Girl fights leopard and survives", "Boy builds rocket in village", 
        "Man eats only grass for 5 years", "Baba predicts end of Modi Govt"
    ];

    const handleSubmit = (e: FormEvent) => {
        e.preventDefault();
        if(topic.trim()){
            onGenerate(topic.trim());
            setTopic('');
        }
    };
    
    const handleSampleClick = (sampleTopic: string) => {
        onGenerate(sampleTopic);
        setTopic('');
    };

    if(!isOpen) return null;

    return (
        <div className="fixed inset-0 bg-black/60 z-40 flex items-center justify-center p-4 backdrop-blur-sm" onClick={onClose}>
            <div className="bg-white dark:bg-gray-800/95 rounded-2xl shadow-2xl w-full max-w-2xl border border-gray-200 dark:border-gray-700" onClick={e => e.stopPropagation()}>
                <div className="flex justify-between items-center p-4 border-b dark:border-gray-700">
                    <h2 className="text-xl font-bold text-gray-800 dark:text-gray-100">Generate Viral Post</h2>
                    <button onClick={onClose} className="p-1 rounded-full text-gray-500 hover:text-gray-800 dark:hover:text-gray-200 hover:bg-gray-200 dark:hover:bg-gray-700 transition-colors"><CloseIcon/></button>
                </div>
                <form onSubmit={handleSubmit}>
                    <div className="p-6">
                        <label htmlFor="viral-topic" className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-2">
                            Enter a topic to make it viral
                        </label>
                        <textarea
                            id="viral-topic"
                            rows={3}
                            value={topic}
                            onChange={(e) => setTopic(e.target.value)}
                            placeholder="e.g., A new social media trend, a political controversy, a bizarre local event..."
                            className="w-full p-2.5 border rounded-md bg-white dark:bg-gray-700 dark:border-gray-600 focus:ring-2 focus:ring-primary focus:border-primary transition-all"
                        />
                         <div className="mt-4">
                            <h3 className="text-sm font-medium text-gray-700 dark:text-gray-300 mb-2">Or try a sample topic:</h3>
                            <div className="flex flex-wrap gap-2">
                                {sampleTopics.map(sample => (
                                    <button
                                        type="button"
                                        key={sample}
                                        onClick={() => handleSampleClick(sample)}
                                        className="px-3 py-1.5 text-sm bg-gray-200 dark:bg-gray-700 rounded-full hover:bg-gray-300 dark:hover:bg-gray-600 transition-all transform hover:scale-105"
                                    >
                                        {sample}
                                    </button>
                                ))}
                            </div>
                        </div>
                    </div>
                    <div className="p-4 bg-gray-50 dark:bg-gray-800 border-t dark:border-gray-700 flex justify-end rounded-b-2xl">
                        <button type="submit" disabled={!topic.trim()} className="px-6 py-2 bg-gradient-to-r from-purple-500 to-pink-500 text-white font-semibold rounded-md hover:from-purple-600 hover:to-pink-600 shadow-md hover:shadow-lg transition-all transform hover:-translate-y-px disabled:opacity-50 disabled:cursor-not-allowed flex items-center gap-2">
                            <GenerateIcon className="w-5 h-5"/>
                            Generate
                        </button>
                    </div>
                </form>
            </div>
        </div>
    );
};

export default MainAppPage;