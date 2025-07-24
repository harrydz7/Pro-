
import React, { useState, useCallback, useEffect } from 'react';
import Spinner from './components/Spinner.tsx';
import { useNotification } from './src/contexts/NotificationContext.tsx';
import { ThumbsUpIcon, ChatBubbleIcon, EyeIcon, DownloadIcon, DownloadAllIcon } from './components/IconComponents.tsx';
import JSZip from 'jszip';

// --- LOCALSTORAGE KEYS ---
const SCRAPER_FB_TOKEN_KEY = 'scraper_fb_token';
const SCRAPER_FB_COOKIE_KEY = 'scraper_fb_cookie';

type Platform = 'Facebook' | 'Instagram' | 'Twitter' | 'YouTube';

interface ScrapedMedia {
    pageUrl: string;
    thumbnailUrl: string;
    downloadUrl: string;
    likes: string;
    comments: string;
    views: string;
}

const platformLogos: Record<Platform, string> = {
    Facebook: 'https://upload.wikimedia.org/wikipedia/commons/5/51/Facebook_f_logo_%282019%29.svg',
    Instagram: 'https://upload.wikimedia.org/wikipedia/commons/a/a5/Instagram_icon.png',
    Twitter: 'https://upload.wikimedia.org/wikipedia/commons/6/6f/Logo_of_Twitter.svg',
    YouTube: 'https://upload.wikimedia.org/wikipedia/commons/0/09/YouTube_full-color_icon_%282017%29.svg',
};

const BACKEND_PORT = 3001;
const BACKEND_URL = `http://localhost:${BACKEND_PORT}`;

type SortByType = 'default' | 'video' | 'image';

// --- Helper Functions ---
async function downloadFile(url: string, filename: string) {
    try {
        const response = await fetch(`${BACKEND_URL}/download-proxy?url=${encodeURIComponent(url)}`);
        if (!response.ok) {
            const errorData = await response.json().catch(() => ({ message: response.statusText }));
            throw new Error(errorData.message || `Network response was not ok: ${response.statusText}`);
        }
        const blob = await response.blob();
        const link = document.createElement('a');
        link.href = URL.createObjectURL(blob);
        link.download = filename;
        document.body.appendChild(link);
        link.click();
        document.body.removeChild(link);
        URL.revokeObjectURL(link.href);
    } catch (error) {
        console.error('Download failed:', error);
        window.open(url, '_blank');
        throw new Error('Download via proxy failed. Opening in new tab as fallback.');
    }
}

// --- Media Card Component ---
const MediaCard: React.FC<{ media: ScrapedMedia }> = ({ media }) => {
    const [isDownloading, setIsDownloading] = useState(false);
    const { addNotification } = useNotification();

    const handleDownload = async () => {
        setIsDownloading(true);
        addNotification('Starting download...', 'info');
        try {
            const urlPath = new URL(media.pageUrl).pathname;
            const filenameBase = urlPath.split('/').filter(Boolean).pop() || media.pageUrl.split('=').pop() || Date.now();
            const fileExtensionMatch = media.downloadUrl.match(/\.(mp4|jpg|jpeg|png|gif|webp)(\?|$)/i);
            const fileExtension = fileExtensionMatch ? fileExtensionMatch[1] : 'jpg';
            const filename = `${filenameBase}.${fileExtension}`;
            
            await downloadFile(media.downloadUrl, filename);
            addNotification('Download successful!', 'success');
        } catch (error: any) {
            addNotification(error.message || 'Download failed.', 'error');
        } finally {
            setIsDownloading(false);
        }
    };
    
    return (
        <div className="bg-white dark:bg-gray-800 rounded-xl shadow-lg border border-gray-200 dark:border-gray-700 overflow-hidden flex flex-col transition-transform hover:-translate-y-1">
            <a href={media.pageUrl} target="_blank" rel="noopener noreferrer" className="block aspect-square bg-gray-200 dark:bg-gray-700">
                <img src={media.thumbnailUrl} alt="media thumbnail" className="w-full h-full object-cover" loading="lazy" crossOrigin="anonymous" />
            </a>
            <div className="p-4 flex-grow flex flex-col justify-between">
                <div className="flex justify-around items-center text-xs text-gray-600 dark:text-gray-400">
                    <span className="flex items-center gap-1.5" title="Likes"><ThumbsUpIcon className="w-4 h-4" />{media.likes}</span>
                    <span className="flex items-center gap-1.5" title="Comments"><ChatBubbleIcon className="w-4 h-4" />{media.comments}</span>
                    {media.views && <span className="flex items-center gap-1.5" title="Views"><EyeIcon className="w-4 h-4" />{media.views}</span>}
                </div>
                <button
                    onClick={handleDownload}
                    disabled={isDownloading}
                    className="w-full mt-4 py-2 px-3 text-sm font-semibold text-white bg-green-600 rounded-lg shadow-md hover:bg-green-700 disabled:opacity-50 flex items-center justify-center gap-2 transition-all"
                >
                    {isDownloading ? <Spinner size="sm" /> : <DownloadIcon className="w-4 h-4" />}
                    {isDownloading ? "Downloading..." : "Download HQ"}
                </button>
            </div>
        </div>
    );
};


const ScraperPage: React.FC = () => {
    const { addNotification } = useNotification();
    const [activePlatform, setActivePlatform] = useState<Platform>('Facebook');
    const [url, setUrl] = useState('');
    const [sortBy, setSortBy] = useState<SortByType>('default');
    const [isLoading, setIsLoading] = useState(false);
    const [isZipping, setIsZipping] = useState(false);
    const [scrapedData, setScrapedData] = useState<ScrapedMedia[] | null>(null);

    // New state for token and cookies
    const [accessToken, setAccessToken] = useState<string>(() => localStorage.getItem(SCRAPER_FB_TOKEN_KEY) || '');
    const [cookieString, setCookieString] = useState<string>(() => localStorage.getItem(SCRAPER_FB_COOKIE_KEY) || '');

    // Persist token and cookies to localStorage
    useEffect(() => {
        localStorage.setItem(SCRAPER_FB_TOKEN_KEY, accessToken);
    }, [accessToken]);

    useEffect(() => {
        localStorage.setItem(SCRAPER_FB_COOKIE_KEY, cookieString);
    }, [cookieString]);

    const handleScrape = useCallback(async () => {
        if (!url.trim()) {
            addNotification('Please enter a URL to scrape.', 'error');
            return;
        }
        if (activePlatform === 'Facebook' && (!accessToken || !cookieString)) {
             addNotification('Please provide both an Access Token and a Cookie String for Facebook.', 'error');
            return;
        }

        setIsLoading(true);
        setScrapedData(null);
        addNotification(`Scraping data from ${activePlatform}... This may take a moment.`, 'info');

        try {
            const response = await fetch(`${BACKEND_URL}/scrape`, {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({
                    platform: activePlatform,
                    url: url,
                    sortBy: sortBy,
                    accessToken: accessToken,
                    cookieString: cookieString,
                }),
            });

            if (!response.ok) {
                const errorData = await response.json();
                throw new Error(errorData.message || `Server responded with status ${response.status}`);
            }

            const result = await response.json();
            
            if(Array.isArray(result.data) && result.data.length > 0) {
                setScrapedData(result.data);
                addNotification(`Scraping successful! Found ${result.data.length} items.`, 'success');
            } else {
                 setScrapedData([]);
                 addNotification('Scraping finished, but no media items were found. The page might be empty, private, or your credentials might be invalid.', 'info');
            }

        } catch (e: any) {
            addNotification(`An error occurred: ${e.message}`, 'error');
            console.error("Scraping error:", e);
        } finally {
            setIsLoading(false);
        }
    }, [url, activePlatform, addNotification, sortBy, accessToken, cookieString]);

    const handleDownloadAll = useCallback(async () => {
        if (!scrapedData || scrapedData.length === 0) return;
    
        setIsZipping(true);
        addNotification(`Preparing to download ${scrapedData.length} files...`, 'info');
    
        try {
            const zip = new JSZip();
            
            await Promise.all(scrapedData.map(async (media, index) => {
                try {
                    const response = await fetch(`${BACKEND_URL}/download-proxy?url=${encodeURIComponent(media.downloadUrl)}`);
                    if (!response.ok) throw new Error(`Failed to fetch ${media.thumbnailUrl}`);
                    const blob = await response.blob();
    
                    const urlPath = new URL(media.pageUrl).pathname;
                    const filenameBase = urlPath.split('/').filter(Boolean).pop() || media.pageUrl.split('=').pop() || `${index}_${Date.now()}`;
                    const fileExtensionMatch = media.downloadUrl.match(/\.(mp4|jpg|jpeg|png|gif|webp)(\?|$)/i);
                    const fileExtension = fileExtensionMatch ? fileExtensionMatch[1] : 'jpg';
                    const filename = `${filenameBase}.${fileExtension}`;
                    
                    zip.file(filename, blob);
                } catch (error) {
                    console.error(`Skipping file due to error: ${media.downloadUrl}`, error);
                    addNotification(`Skipped one file due to a download error.`, 'error');
                }
            }));
    
            if (Object.keys(zip.files).length > 0) {
                addNotification('Zipping files...', 'info');
                const zipBlob = await zip.generateAsync({ type: 'blob' });
    
                const link = document.createElement('a');
                link.href = URL.createObjectURL(zipBlob);
                link.download = `scraped_media_${Date.now()}.zip`;
                document.body.appendChild(link);
                link.click();
                document.body.removeChild(link);
                URL.revokeObjectURL(link.href);
                addNotification('Download started!', 'success');
            } else {
                addNotification('Could not download any files.', 'error');
            }
    
        } catch (error: any) {
            addNotification(`An error occurred during zipping: ${error.message}`, 'error');
            console.error("Zipping error:", error);
        } finally {
            setIsZipping(false);
        }
    }, [scrapedData, addNotification]);

    const renderPlatformTabs = () => {
        return (
            <div className="flex border-b border-gray-200 dark:border-gray-700">
                {(['Facebook'] as Platform[]).map(platform => ( // Simplified to only show implemented platform
                    <button
                        key={platform}
                        onClick={() => {
                            setActivePlatform(platform);
                            setScrapedData(null);
                            setUrl('');
                            setSortBy('default');
                        }}
                        className={`flex items-center gap-2 px-4 py-3 -mb-px text-sm font-semibold transition-colors border-b-2 ${activePlatform === platform ? 'border-primary text-primary' : 'border-transparent text-gray-500 hover:border-gray-300'}`}
                    >
                        <img src={platformLogos[platform]} alt={`${platform} logo`} className="w-5 h-5" />
                        {platform}
                    </button>
                ))}
                 <div className="px-4 py-3 text-sm text-gray-400 dark:text-gray-600">(Instagram, Twitter, etc. coming soon)</div>
            </div>
        );
    };

    return (
        <div className="space-y-6">
            <div className="p-4 bg-white dark:bg-gray-800/80 backdrop-blur-sm rounded-xl shadow-lg border border-gray-200 dark:border-gray-700/50">
                <h1 className="text-2xl font-bold">Social Media Scraper</h1>
                <p className="text-sm text-gray-500 dark:text-gray-400 mt-1">
                    Enter authentication details and a public URL to extract media.
                </p>
            </div>

            <div className="bg-white dark:bg-gray-800 rounded-xl shadow-lg border border-gray-200 dark:border-gray-700/50">
                {renderPlatformTabs()}
                <div className="p-6 space-y-4">
                    <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                        <div>
                            <label className="block text-sm font-medium mb-1.5" htmlFor="access-token">Access Token</label>
                            <input
                                id="access-token"
                                type="password"
                                value={accessToken}
                                onChange={(e) => setAccessToken(e.target.value)}
                                placeholder="Paste your EAAG... token here"
                                className="w-full p-3 border rounded-md bg-white dark:bg-gray-700 dark:border-gray-600 focus:ring-2 focus:ring-primary"
                                disabled={isLoading || isZipping}
                            />
                        </div>
                        <div>
                            <label className="block text-sm font-medium mb-1.5" htmlFor="cookie-string">Cookie String</label>
                             <input
                                id="cookie-string"
                                type="password"
                                value={cookieString}
                                onChange={(e) => setCookieString(e.target.value)}
                                placeholder="Paste your full cookie string here"
                                className="w-full p-3 border rounded-md bg-white dark:bg-gray-700 dark:border-gray-600 focus:ring-2 focus:ring-primary"
                                disabled={isLoading || isZipping}
                            />
                        </div>
                    </div>
                    <div className="flex flex-col sm:flex-row gap-4">
                        <input
                            type="text"
                            value={url}
                            onChange={(e) => setUrl(e.target.value)}
                            placeholder={`Enter ${activePlatform} URL (e.g., profile, page, group)`}
                            className="flex-grow p-3 border rounded-md bg-white dark:bg-gray-700 dark:border-gray-600 focus:ring-2 focus:ring-primary"
                            disabled={isLoading || isZipping}
                        />
                        <select
                            value={sortBy}
                            onChange={(e) => setSortBy(e.target.value as SortByType)}
                            disabled={isLoading || isZipping}
                            className="p-3 border rounded-md bg-white dark:bg-gray-700 dark:border-gray-600 focus:ring-2 focus:ring-primary sm:w-40"
                        >
                            <option value="default">Posts</option>
                            <option value="image">Images</option>
                            <option value="video">Videos</option>
                        </select>
                        <button
                            onClick={handleScrape}
                            disabled={isLoading || isZipping || !url.trim()}
                            className="px-6 py-3 bg-primary text-primary-text font-semibold rounded-md hover:bg-primary-hover shadow-md hover:shadow-lg disabled:opacity-50 flex items-center justify-center gap-2"
                        >
                            {isLoading ? <Spinner size="sm" /> : 'Scrape Data'}
                        </button>
                    </div>

                    <div className="mt-6 p-4 bg-gray-50 dark:bg-gray-900/50 rounded-lg min-h-[300px] border border-gray-200 dark:border-gray-700">
                        {scrapedData && scrapedData.length > 0 && (
                            <div className="mb-4 text-right">
                                <button
                                    onClick={handleDownloadAll}
                                    disabled={isZipping || isLoading}
                                    className="px-4 py-2 bg-green-600 text-white font-semibold rounded-md hover:bg-green-700 disabled:opacity-50 flex items-center gap-2 transition-all transform hover:-translate-y-px shadow-md hover:shadow-lg"
                                >
                                    {isZipping ? <Spinner size="sm" color="text-white"/> : <DownloadAllIcon className="w-5 h-5" />}
                                    <span>{isZipping ? 'Zipping...' : `Download All (${scrapedData.length})`}</span>
                                </button>
                            </div>
                        )}
                        {isLoading ? (
                            <div className="flex flex-col items-center justify-center h-full py-10">
                                <Spinner size="lg" />
                                <p className="mt-4 text-gray-500">Scraping... This can take up to a minute.</p>
                            </div>
                        ) : scrapedData ? (
                            scrapedData.length > 0 ? (
                            <div className="grid grid-cols-1 sm:grid-cols-2 md:grid-cols-3 lg:grid-cols-4 gap-4">
                                {scrapedData.map((media, index) => <MediaCard key={`${media.pageUrl}-${index}`} media={media} />)}
                            </div>
                            ) : (
                            <p className="text-gray-500 text-center py-10">No media found. The page might be empty, private, or your credentials might be invalid.</p>
                            )
                        ) : (
                            <p className="text-gray-500 text-center py-10">Scraped data will appear here. Make sure your local backend server is running.</p>
                        )}
                    </div>
                </div>
            </div>
        </div>
    );
};

export default ScraperPage;
