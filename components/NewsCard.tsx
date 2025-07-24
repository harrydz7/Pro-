import React, { useRef, CSSProperties, ChangeEvent } from 'react';
import { 
    NewsArticle, CardDisplayState,
    hexToRgba,
    FontSizeOptions
} from '../types.ts'; 
import Spinner from './Spinner.tsx';
import { GenerateIcon, DownloadIcon, EditIcon, UploadIcon } from './IconComponents.tsx';

interface NewsCardProps {
  article: NewsArticle;
  onDownload: (cardElement: HTMLElement, article: NewsArticle) => void;
  onGenerateAiImage: (articleId: string) => void;
  onUploadImage: (articleId: string, file: File) => void;
  onEdit: (articleId: string) => void;
  editingCardId: string | null; // To know if this card is being edited
  isEditingAll?: boolean; // To know if all cards are being edited
}

const NewsCard: React.FC<NewsCardProps> = ({
  article,
  onDownload,
  onGenerateAiImage,
  onUploadImage,
  onEdit,
  editingCardId,
  isEditingAll = false,
}) => {
  const { style } = article;
  const cardWrapperRef = useRef<HTMLDivElement>(null);
  const uploadInputRef = useRef<HTMLInputElement>(null);

  const isEditing = article.id === editingCardId;

  const displayImageUrl = article.localImageUrl 
    ? article.localImageUrl
    : article.aiImageUrl 
    ? article.aiImageUrl 
    : (article.pixabayImages[0]?.webformatURL || null);

  const handleUploadClick = () => {
    uploadInputRef.current?.click();
  };

  const handleFileChange = (event: ChangeEvent<HTMLInputElement>) => {
    if (event.target.files && event.target.files[0]) {
      onUploadImage(article.id, event.target.files[0]);
    }
  };

  const outlineWrapperStyle: CSSProperties = {
    borderRadius: `${style.outlineRoundedCorners}px`,
  };

  if (style.outlineEnabled) {
    outlineWrapperStyle.outlineStyle = style.outlineType;
    outlineWrapperStyle.outlineColor = style.outlineColor;
    outlineWrapperStyle.outlineWidth = `${style.outlineWidth}px`;
    outlineWrapperStyle.outlineOffset = `${style.outlineOffset}px`;
  }
  
  const cardContainerStyle: CSSProperties = {
    borderRadius: `${style.outlineRoundedCorners}px`,
  };

  const headerOuterStyle: CSSProperties = {
    minHeight: '80px', 
    padding: '1rem 0.75rem', 
    zIndex: 10,
  };

  if (style.headerType === 'solid') {
    headerOuterStyle.backgroundColor = style.selectedHeaderColor;
  } else if (style.headerType === 'gradient') {
    headerOuterStyle.background = `linear-gradient(${style.headerGradientDirection}, ${style.headerGradientColor1}, ${style.headerGradientColor2})`;
  }

  const headlineStyle: CSSProperties = {
    fontFamily: style.headlineFontFamily,
    fontWeight: style.headlineFontWeight,
    fontSize: `${style.headlineTextSize}px`,
    textAlign: style.headlineTextAlign,
    maxWidth: `${style.headlineTextWidth}%`,
    letterSpacing: `${style.headlineLetterSpacing}px`,
    lineHeight: style.headlineLineHeight,
    overflowWrap: 'break-word',
    wordWrap: 'break-word',
    margin: style.headlineTextAlign === 'center' ? '0 auto' : '0',
  };

  const textTransformClass = style.textCase === 'uppercase' ? 'uppercase' : '';

  const imageOverlayStyle: CSSProperties = {
    position: 'absolute',
    zIndex: 5,
    pointerEvents: 'none',
  };

  const transparentOverlayBg = hexToRgba(style.overlayBackgroundColor, 0);
  const solidOverlayBg = hexToRgba(style.overlayBackgroundColor, 0.7);

  if (style.overlayVisible) {
    switch (style.overlayPosition) {
      case 'top':
        imageOverlayStyle.top = 0; imageOverlayStyle.left = 0; imageOverlayStyle.right = 0;
        imageOverlayStyle.height = `${style.overlayHeight}%`;
        imageOverlayStyle.background = style.overlayIsSolid ? solidOverlayBg : `linear-gradient(to bottom, ${solidOverlayBg} 0%, ${transparentOverlayBg} 100%)`;
        break;
      case 'bottom':
        imageOverlayStyle.bottom = 0; imageOverlayStyle.left = 0; imageOverlayStyle.right = 0;
        imageOverlayStyle.height = `${style.overlayHeight}%`;
        imageOverlayStyle.background = style.overlayIsSolid ? solidOverlayBg : `linear-gradient(to top, ${solidOverlayBg} 0%, ${transparentOverlayBg} 100%)`;
        break;
      case 'left':
        imageOverlayStyle.top = 0; imageOverlayStyle.left = 0; imageOverlayStyle.bottom = 0;
        imageOverlayStyle.width = `${style.overlayHeight}%`;
        imageOverlayStyle.background = style.overlayIsSolid ? solidOverlayBg : `linear-gradient(to right, ${solidOverlayBg} 0%, ${transparentOverlayBg} 100%)`;
        break;
      case 'right':
        imageOverlayStyle.top = 0; imageOverlayStyle.right = 0; imageOverlayStyle.bottom = 0;
        imageOverlayStyle.width = `${style.overlayHeight}%`;
        imageOverlayStyle.background = style.overlayIsSolid ? solidOverlayBg : `linear-gradient(to left, ${solidOverlayBg} 0%, ${transparentOverlayBg} 100%)`;
        break;
    }
    if (style.overlayOneSideBorderEnabled) {
      const borderStyle = `${style.overlayBorderWidth}px solid ${style.overlayBorderColor}`;
      if (style.overlayBorderPosition === 'top') imageOverlayStyle.borderTop = borderStyle;
      if (style.overlayBorderPosition === 'bottom') imageOverlayStyle.borderBottom = borderStyle;
      if (style.overlayBorderPosition === 'left') imageOverlayStyle.borderLeft = borderStyle;
      if (style.overlayBorderPosition === 'right') imageOverlayStyle.borderRight = borderStyle;
    }
  }

  const isImageLoading = article.isAiImageLoading || article.displayState === CardDisplayState.PIXABAY_FETCHING;
  const downloadButtonDisabled = isImageLoading || 
                                 !displayImageUrl ||
                                 article.displayState === CardDisplayState.SUBJECT_OBJECT_QUERY_FAILED ||
                                 article.displayState === CardDisplayState.PIXABAY_NO_IMAGES_FOUND ||
                                 article.displayState === CardDisplayState.AI_IMAGE_FAILED;

  return (
    <div className={`flex flex-col rounded-lg transition-all duration-300 ${isEditing ? 'ring-4 ring-offset-2 ring-blue-500 dark:ring-blue-400 dark:ring-offset-gray-900' : isEditingAll ? 'ring-2 ring-yellow-500 dark:ring-yellow-400' : ''}`}>
      <div
        ref={cardWrapperRef}
        style={outlineWrapperStyle}
        className={`news-card-wrapper flex flex-col transition-all duration-300 ease-in-out ${isEditing || isEditingAll ? 'transform scale-[1.005] shadow-2xl' : 'shadow-lg transform hover:scale-[1.005]'}`}
      >
        <div 
          className="card-container flex flex-col h-full overflow-hidden dark:border dark:border-gray-700 bg-white dark:bg-gray-800"
          style={cardContainerStyle}
        >
          <div 
              className="card-header-outer flex items-center justify-center"
              style={headerOuterStyle}
            >
              {article.isHighlighting ? (
                <div className="flex items-center justify-center h-full">
                  <Spinner size="sm" color="text-white" />
                  <p className="ml-2 text-white text-sm">Styling headline...</p>
                </div>
              ) : (
                <h2 
                  className={`card-header-text text-white ${textTransformClass}`} 
                  style={headlineStyle}
                  dangerouslySetInnerHTML={article.highlighted_headline_html ? { __html: article.highlighted_headline_html } : undefined}
                >
                  {!article.highlighted_headline_html ? article.long_headline : null}
                </h2>
              )}
          </div>

          <div className="relative flex-grow bg-gray-200 dark:bg-gray-750" style={{ minHeight: '250px' }}>
              <div className="image-wrapper absolute inset-0 bg-gray-200 dark:bg-gray-750" style={{ overflow: 'hidden' }}>
                  { (article.displayState === CardDisplayState.INITIAL && !displayImageUrl) && <div className="absolute inset-0 flex items-center justify-center text-gray-500 dark:text-gray-400 p-2 text-center">Preparing image query...</div> }
                  { article.displayState === CardDisplayState.PIXABAY_FETCHING && <div className="absolute inset-0 flex flex-col items-center justify-center"><Spinner /><p className="mt-2 text-sm text-gray-600 dark:text-gray-300">Fetching subject image...</p></div> }
                  { article.displayState === CardDisplayState.AI_IMAGE_LOADING && <div className="absolute inset-0 flex flex-col items-center justify-center"><Spinner /><p className="mt-2 text-sm text-gray-600 dark:text-gray-300">Generating AI image...</p></div> }
                  
                  { (article.displayState === CardDisplayState.SUBJECT_OBJECT_QUERY_FAILED || article.displayState === CardDisplayState.PIXABAY_NO_IMAGES_FOUND || article.displayState === CardDisplayState.PIXABAY_ERROR || (article.displayState === CardDisplayState.AI_IMAGE_FAILED && !displayImageUrl)) && !isImageLoading &&
                  <div className="absolute inset-0 flex items-center justify-center bg-red-100 dark:bg-red-900 p-2 text-center">
                      <p className="text-red-700 dark:text-red-300 text-xs">
                      {article.subjectPixabayError || article.aiImageError || "No image available for subject."}
                      </p>
                  </div>
                  }
                  
                  {displayImageUrl && (
                    <div 
                        aria-label={article.subjectPixabayQuery || article.long_headline}
                        className="card-image absolute inset-0 w-full h-full" 
                        style={{
                            backgroundImage: `url("${displayImageUrl}")`,
                            backgroundSize: 'cover',
                            backgroundPosition: 'center',
                        }}
                    />
                  )}

                  {(!displayImageUrl && ![CardDisplayState.INITIAL, CardDisplayState.PIXABAY_FETCHING, CardDisplayState.AI_IMAGE_LOADING, CardDisplayState.SUBJECT_OBJECT_QUERY_FAILED, CardDisplayState.PIXABAY_NO_IMAGES_FOUND, CardDisplayState.PIXABAY_ERROR, CardDisplayState.AI_IMAGE_FAILED].includes(article.displayState)) &&
                      <div className="absolute inset-0 flex items-center justify-center text-gray-500 dark:text-gray-400 p-2 text-center">No image available.</div>
                  }

                  {style.overlayVisible && <div style={imageOverlayStyle}></div>}

                  {/* Sources Overlay */}
                  {style.showSources && article.sources && article.sources.length > 0 && (
                    <div className="absolute bottom-2 left-2 z-10 p-2 max-w-[70%] bg-black/40 rounded-md text-white">
                        <p className="font-semibold text-[10px] leading-tight mb-1 opacity-90 tracking-wider">SOURCES</p>
                        <ul className="list-none pl-0 space-y-0.5">
                        {article.sources.slice(0, 2).map((source, idx) => source.web && (
                            <li key={idx} className="truncate">
                                <a 
                                    href={source.web.uri} 
                                    target="_blank" 
                                    rel="noopener noreferrer" 
                                    className="hover:underline text-[9px] leading-tight opacity-80 hover:opacity-100" 
                                    title={source.web.title}
                                >
                                    {source.web.title || source.web.uri}
                                </a>
                            </li>
                        ))}
                        </ul>
                    </div>
                  )}
                  
                  {article.isObjectAiImageQueryReady && article.objectAiImageQuery && (
                  <div className="no-screenshot absolute bottom-2 right-2 h-16 w-16 md:h-20 md:w-20 rounded-full overflow-hidden border-2 border-white dark:border-gray-300 shadow-lg z-10 bg-gray-300 dark:bg-gray-600 flex items-center justify-center">
                      {article.isObjectAiImageLoading && <Spinner size="sm" />}
                      {!article.isObjectAiImageLoading && article.objectAiImageUrl && (
                      <img 
                          src={article.objectAiImageUrl} 
                          alt={article.objectAiImageQuery} 
                          className="w-full h-full object-cover" 
                          crossOrigin={article.objectAiImageUrl.startsWith('data:') ? undefined : "anonymous"}
                      />
                      )}
                      {!article.isObjectAiImageLoading && !article.objectAiImageUrl && (
                      <p className="text-xs text-center text-gray-700 dark:text-gray-200 p-1">
                          {article.objectAiImageError ? 'Error' : 'N/A'}
                      </p>
                      )}
                  </div>
                  )}
              </div>
          </div>
            
          {style.showSummary && (
              <div className="summary-text-area p-3 border-t border-gray-200 dark:border-gray-700 bg-gray-50 dark:bg-gray-750">
                  <p className={`m-0 ${textTransformClass} text-gray-800 dark:text-gray-200 ${FontSizeOptions[style.summaryFontSizeKey].summary}`} dangerouslySetInnerHTML={{ __html: article.summary }}></p>
              </div>
          )}
        </div>
      </div>
      
      <div className="no-screenshot p-2 border-t border-gray-200 dark:border-gray-700 bg-gray-50 dark:bg-gray-800/50">
        <input type="file" ref={uploadInputRef} onChange={handleFileChange} accept="image/png, image/jpeg" className="hidden" />
        <div className="grid grid-cols-2 sm:grid-cols-4 gap-2 text-xs">
            <button onClick={() => onGenerateAiImage(article.id)} disabled={article.isAiImageLoading} className="flex items-center justify-center gap-1 p-1.5 rounded-md bg-blue-500 text-white hover:bg-blue-600 disabled:opacity-50 transition-colors">
                {article.isAiImageLoading ? <Spinner size="sm" color="text-white"/> : <GenerateIcon className="w-4 h-4" />} BG
            </button>
            <button onClick={handleUploadClick} className="flex items-center justify-center gap-1 p-1.5 rounded-md bg-indigo-500 text-white hover:bg-indigo-600 disabled:opacity-50 transition-colors">
                <UploadIcon className="w-4 h-4" /> BG
            </button>
            <button 
              onClick={() => onEdit(article.id)} 
              className={`flex items-center justify-center gap-1 p-1.5 rounded-md text-white transition-colors ${isEditing ? 'bg-blue-700 hover:bg-blue-800' : 'bg-gray-600 hover:bg-gray-700'}`}
            >
                <EditIcon className="w-4 h-4" /> {isEditing ? 'Editing' : 'Edit'}
            </button>
            <button 
                onClick={() => { if (cardWrapperRef.current) onDownload(cardWrapperRef.current, article); }}
                disabled={downloadButtonDisabled} 
                className="flex items-center justify-center gap-1 p-1.5 rounded-md bg-green-600 text-white hover:bg-green-700 disabled:opacity-50 transition-colors">
                <DownloadIcon className="w-4 h-4" /> Download
            </button>
        </div>
      </div>
    </div>
  );
};

export default NewsCard;