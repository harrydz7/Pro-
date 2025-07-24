

import React, { useState, useEffect, useCallback, useMemo, useRef } from 'react';
import Spinner from './components/Spinner.tsx';
import { TrashIcon, ThumbsUpIcon, ChatBubbleIcon, EyeIcon, CloseIcon, GenerateIcon } from './components/IconComponents.tsx';
import * as geminiService from './services/geminiService.ts';
import { useNotification } from './src/contexts/NotificationContext.tsx';
import { FBPage, ManagedPost } from './types.ts';

// --- CONSTANTS ---
const ACCESS_TOKEN_KEY = 'fbUploader_accessToken_v2';
const PAGES_KEY = 'fbUploader_pages_v2';
const API_VERSION = 'v19.0';

type PostSortKey = 'default' | 'likes' | 'comments' | 'reach';

// --- HELPER COMPONENTS ---
const FacebookIcon: React.FC<{ className?: string }> = ({ className = "w-12 h-12" }) => (
    <svg className={className} fill="currentColor" viewBox="0 0 24 24" xmlns="http://www.w3.org/2000/svg">
        <path d="M22.675 0h-21.35c-.732 0-1.325.593-1.325 1.325v21.351c0 .731.593 1.324 1.325 1.324h11.495v-9.294h-3.128v-3.622h3.128v-2.671c0-3.1 1.893-4.788 4.659-4.788 1.325 0 2.463.099 2.795.143v3.24l-1.918.001c-1.504 0-1.795.715-1.795 1.763v2.313h3.587l-.467 3.622h-3.12v9.293h6.116c.73 0 1.323-.593 1.323-1.325v-21.35c0-.732-.593-1.325-1.323-1.325z"/>
    </svg>
);

// --- MAIN CONTENT COMPONENT ---
const ManagePostsContent: React.FC<{ activePage: FBPage, onAuthError: () => void }> = ({ activePage, onAuthError }) => {
    const { addNotification } = useNotification();
    
    // Post Management State
    const [postTypeToShow, setPostTypeToShow] = useState<'published' | 'scheduled'>('published');
    const [publishedPosts, setPublishedPosts] = useState<ManagedPost[]>([]);
    const [scheduledPosts, setScheduledPosts] = useState<ManagedPost[]>([]);
    const [isFetchingPosts, setIsFetchingPosts] = useState(false);
    const [isFetchingMore, setIsFetchingMore] = useState(false);
    const [postsError, setPostsError] = useState<string | null>(null);
    const [nextPageUrl, setNextPageUrl] = useState<string | null>(null);
    const [sortKey, setSortKey] = useState<PostSortKey>('default');
    
    // Delete All Modal
    const [isDeleteAllModalOpen, setIsDeleteAllModalOpen] = useState(false);
    const [isDeletingAll, setIsDeletingAll] = useState(false);
    const [deleteAllProgress, setDeleteAllProgress] = useState({ current: 0, total: 0 });

    // AI Reply State
    const [replyingPostId, setReplyingPostId] = useState<string | null>(null);
    const [isBulkReplying, setIsBulkReplying] = useState(false);

    const handleCardClick = (e: React.MouseEvent<HTMLDivElement>, post: ManagedPost) => {
        // Prevent navigation if a button inside the card was clicked
        if ((e.target as HTMLElement).closest('button')) {
            return;
        }

        if (postTypeToShow === 'published' && post.permalink_url) {
            window.open(post.permalink_url, '_blank', 'noopener,noreferrer');
        }
    };
    
    const handleFetchPosts = useCallback(async (
        page: FBPage,
        type: 'published' | 'scheduled',
        urlOverride: string | null = null
    ): Promise<string | null> => {
        const isLoadMore = !!urlOverride;
        if (isLoadMore) {
            setIsFetchingMore(true);
        } else {
            setIsFetchingPosts(true);
        }
        setPostsError(null);
    
        try {
            if (type === 'published') {
                const primaryFields = 'id,message,created_time,permalink_url';
                const baseUrl = `https://graph.facebook.com/${API_VERSION}/${page.id}/posts?fields=${primaryFields}&limit=25&access_token=${page.access_token}`;
                const url = urlOverride || baseUrl;
    
                const response = await fetch(url);
                const data = await response.json();
                if (data.error) throw new Error(`Primary data fetch failed: ${data.error.message}`);
    
                let primaryPosts: ManagedPost[] = data.data || [];
                const nextUrl = data.paging?.next || null;
    
                const newPostsWithFullData = primaryPosts.map(p => ({
                    ...p, 
                    full_picture: undefined, 
                    likes: undefined,
                    comments: undefined,
                    insights: undefined
                }));

                if (isLoadMore) {
                    setPublishedPosts(prev => [...prev, ...newPostsWithFullData]);
                } else {
                    setPublishedPosts(newPostsWithFullData);
                }
                setNextPageUrl(nextUrl);
    
                if (primaryPosts.length > 0) {
                    const batch = primaryPosts.map(post => ({
                        method: 'GET',
                        relative_url: `${API_VERSION}/${post.id}?fields=full_picture,likes.summary(true),comments.summary(true),insights.metric(post_impressions_unique).period(lifetime)`
                    }));
    
                    const formData = new FormData();
                    formData.append('access_token', page.access_token);
                    formData.append('batch', JSON.stringify(batch));
    
                    fetch(`https://graph.facebook.com`, { method: 'POST', body: formData })
                        .then(res => res.json())
                        .then(batchData => {
                            if (batchData.error) return;
                            const detailedDataMap = new Map<string, Partial<ManagedPost>>();
                            batchData.forEach((res: any) => {
                                if (res?.code === 200) {
                                    try {
                                        const body = JSON.parse(res.body);
                                        if (body.id) detailedDataMap.set(body.id, body);
                                    } catch (e) {
                                        console.error("Failed to parse batch response body item: ", res.body);
                                    }
                                }
                            });
                            setPublishedPosts(prev => prev.map(post => {
                                const details = detailedDataMap.get(post.id);
                                return details ? { ...post, ...details } : post;
                            }));
                        });
                }
                return nextUrl;
            } else {
                const fields = 'id,message,scheduled_publish_time';
                const url = `https://graph.facebook.com/${API_VERSION}/${page.id}/scheduled_posts?fields=${fields}&limit=50&access_token=${page.access_token}`;
                const response = await fetch(url);
                const data = await response.json();
                if (data.error) throw new Error(data.error.message);
                setScheduledPosts(data.data || []);
                return null;
            }
        } catch (e: any) {
             const message = (e.message || '').toLowerCase();
            if (message.includes('session') || message.includes('token') || message.includes('oauth')) {
                onAuthError();
            } else {
                setPostsError(`Failed to fetch posts: ${e.message}`);
            }
        } finally {
            if (isLoadMore) {
                setIsFetchingMore(false);
            } else {
                setIsFetchingPosts(false);
            }
        }
        return null;
    }, [onAuthError]);

    const handleConfirmDeleteAll = useCallback(async () => {
        if (!activePage || publishedPosts.length === 0) return;

        setIsDeletingAll(true);
        setDeleteAllProgress({ current: 0, total: publishedPosts.length });

        const chunks = [];
        for (let i = 0; i < publishedPosts.length; i += 50) {
            chunks.push(publishedPosts.slice(i, i + 50));
        }

        let totalDeletedCount = 0;
        for (const chunk of chunks) {
            const batch = chunk.map(post => ({ method: 'DELETE', relative_url: `${API_VERSION}/${post.id}` }));
            const formData = new FormData();
            formData.append('access_token', activePage.access_token);
            formData.append('batch', JSON.stringify(batch));
            
            try {
                const response = await fetch(`https://graph.facebook.com`, { method: 'POST', body: formData });
                const responseData = await response.json();
                if (responseData.error) throw new Error(responseData.error.message);
                
                const successfullyDeletedIds = chunk.map((post, index) => responseData[index]?.code === 200 ? post.id : null).filter(Boolean) as string[];
                if (successfullyDeletedIds.length > 0) {
                    setPublishedPosts(prev => prev.filter(p => !successfullyDeletedIds.includes(p.id)));
                }
                totalDeletedCount += successfullyDeletedIds.length;
                setDeleteAllProgress({ current: totalDeletedCount, total: publishedPosts.length });

            } catch (e: any) {
                 const message = (e.message || '').toLowerCase();
                 if (message.includes('session') || message.includes('token') || message.includes('oauth')) {
                    addNotification('Facebook token expired during deletion.', 'error');
                    onAuthError();
                    break;
                 }
                 addNotification(`Batch deletion failed: ${e.message}`, 'error');
                 break;
            }
        }
        setIsDeletingAll(false);
        setIsDeleteAllModalOpen(false);
        addNotification(`${totalDeletedCount} posts deleted successfully.`, 'success');
    }, [activePage, publishedPosts, addNotification, onAuthError]);

    const handleAiReplyToAll = useCallback(async (post: ManagedPost) => {
        if (!activePage || replyingPostId) return;

        setReplyingPostId(post.id);
        addNotification(`Starting AI replies for post: "${post.message?.substring(0, 30)}..."`, 'info');

        try {
            // 1. Fetch comments
            const commentsUrl = `https://graph.facebook.com/${API_VERSION}/${post.id}/comments?fields=id,message&limit=100&access_token=${activePage.access_token}`;
            const commentsResponse = await fetch(commentsUrl);
            const commentsData = await commentsResponse.json();
            if (commentsData.error) throw new Error(`Failed to fetch comments: ${commentsData.error.message}`);
            
            const commentsToReply = commentsData.data || [];
            if (commentsToReply.length === 0) {
                addNotification('No comments to reply to on this post.', 'info');
                setReplyingPostId(null);
                return;
            }

            // 2. Loop and reply
            let successCount = 0;
            for (const comment of commentsToReply) {
                try {
                    // Step 1: Like the comment first.
                    const likeFormData = new FormData();
                    likeFormData.append('access_token', activePage.access_token);
                    const likeResponse = await fetch(`https://graph.facebook.com/${API_VERSION}/${comment.id}/likes`, { method: 'POST', body: likeFormData });
                    const likeData = await likeResponse.json();

                    if (likeData.error) {
                        // Don't stop the process, just log it. It might fail if already liked by the page.
                        console.warn(`Could not like comment ${comment.id}: ${likeData.error.message}`);
                    }

                    // Step 2: Generate reply
                    const bestReply = await geminiService.generateSingleBestReply(post.message || '', comment.message);
                    
                    // Step 3: Post the reply
                    const replyFormData = new FormData();
                    replyFormData.append('message', bestReply);
                    replyFormData.append('access_token', activePage.access_token);
                    
                    const replyResponse = await fetch(`https://graph.facebook.com/${API_VERSION}/${comment.id}/comments`, { method: 'POST', body: replyFormData });
                    const replyData = await replyResponse.json();
                    
                    if (replyData.error) {
                        console.error(`Failed to reply to comment ${comment.id}:`, replyData.error.message);
                    } else {
                        successCount++;
                    }
                } catch (e: any) {
                     console.error(`AI generation or reply process failed for comment ${comment.id}:`, e.message);
                }
            }

            addNotification(`Finished AI replies. Successfully replied to ${successCount} out of ${commentsToReply.length} comments.`, 'success');

        } catch (e: any) {
            const message = (e.message || '').toLowerCase();
            if (message.includes('session') || message.includes('token') || message.includes('oauth')) {
                onAuthError();
            } else {
                addNotification(`An error occurred during the AI reply process: ${e.message}`, 'error');
            }
        } finally {
            setReplyingPostId(null);
        }

    }, [activePage, addNotification, replyingPostId, onAuthError]);
    
    const handleBulkAiReplyProcess = useCallback(async () => {
        if (isBulkReplying || replyingPostId) return;

        const postsToProcess = publishedPosts.filter(p => (p.comments?.summary?.total_count ?? 0) > 0);

        if (postsToProcess.length === 0) {
            addNotification("No posts with comments found to reply to.", "info");
            return;
        }

        setIsBulkReplying(true);
        addNotification(`Starting bulk AI replies for ${postsToProcess.length} posts... This may take a while.`, 'info');

        for (const post of postsToProcess) {
            await handleAiReplyToAll(post);
        }

        setIsBulkReplying(false);
        addNotification('Bulk AI reply process finished.', 'success');

    }, [publishedPosts, isBulkReplying, replyingPostId, handleAiReplyToAll, addNotification]);

    useEffect(() => {
        if (activePage) {
            handleFetchPosts(activePage, 'published');
        }
    }, [activePage, handleFetchPosts]);

    const sortedPosts = useMemo(() => {
        const postsToSort = postTypeToShow === 'published' ? publishedPosts : scheduledPosts;
        return [...postsToSort].sort((a, b) => {
            switch (sortKey) {
                case 'likes': return (b.likes?.summary?.total_count ?? 0) - (a.likes?.summary?.total_count ?? 0);
                case 'comments': return (b.comments?.summary?.total_count ?? 0) - (a.comments?.summary?.total_count ?? 0);
                case 'reach': {
                    const valA = a.insights?.data?.[0]?.values?.[0]?.value;
                    const valB = b.insights?.data?.[0]?.values?.[0]?.value;
                    const reachA = typeof valA === 'number' ? valA : 0;
                    const reachB = typeof valB === 'number' ? valB : 0;
                    return reachB - reachA;
                }
                case 'default':
                default:
                    const timeA = a.created_time ? new Date(a.created_time).getTime() : a.scheduled_publish_time ? a.scheduled_publish_time * 1000 : 0;
                    const timeB = b.created_time ? new Date(b.created_time).getTime() : b.scheduled_publish_time ? b.scheduled_publish_time * 1000 : 0;
                    return timeB - timeA;
            }
        });
    }, [publishedPosts, scheduledPosts, postTypeToShow, sortKey]);

    return (
        <div className="space-y-6">
            <div className="flex justify-between items-center flex-wrap gap-4">
                <div className="flex rounded-md shadow-sm">
                    <button onClick={() => setPostTypeToShow('published')} className={`px-4 py-2 rounded-l-md text-sm font-medium transition-colors ${postTypeToShow === 'published' ? 'bg-primary text-primary-text' : 'bg-gray-200 dark:bg-gray-700 hover:bg-gray-300 dark:hover:bg-gray-600'}`}>
                        Published ({publishedPosts.length})
                    </button>
                    <button onClick={() => { setPostTypeToShow('scheduled'); handleFetchPosts(activePage, 'scheduled'); }} className={`px-4 py-2 rounded-r-md text-sm font-medium transition-colors ${postTypeToShow === 'scheduled' ? 'bg-primary text-primary-text' : 'bg-gray-200 dark:bg-gray-700 hover:bg-gray-300 dark:hover:bg-gray-600'}`}>
                        Scheduled ({scheduledPosts.length})
                    </button>
                </div>
                 <div className="flex items-center gap-4">
                    {postTypeToShow === 'published' && (
                        <div className="flex items-center gap-2">
                            <label htmlFor="sort-posts" className="text-sm font-medium text-gray-700 dark:text-gray-300">Sort by:</label>
                            <select id="sort-posts" value={sortKey} onChange={(e) => setSortKey(e.target.value as PostSortKey)} className="p-2 border rounded-md bg-white dark:bg-gray-700 dark:border-gray-600 text-sm">
                                <option value="default">Most Recent</option>
                                <option value="likes">Likes</option>
                                <option value="comments">Comments</option>
                                <option value="reach">Reach</option>
                            </select>
                        </div>
                    )}
                    {postTypeToShow === 'published' && publishedPosts.length > 0 && (
                        <>
                            <button
                                onClick={handleBulkAiReplyProcess}
                                disabled={isBulkReplying || !!replyingPostId}
                                className="px-3 py-2 text-sm bg-purple-600 text-white rounded-md hover:bg-purple-700 flex items-center gap-2 disabled:opacity-50"
                            >
                                {isBulkReplying ? <Spinner size="sm" /> : <GenerateIcon className="w-4 h-4" />}
                                AI Reply to All
                            </button>
                             <button onClick={() => setIsDeleteAllModalOpen(true)} className="px-3 py-2 text-sm bg-red-600 text-white rounded-md hover:bg-red-700 flex items-center gap-2">
                                 <TrashIcon className="w-4 h-4" /> Delete All Loaded
                             </button>
                        </>
                    )}
                </div>
            </div>

            {isFetchingPosts && <div className="flex justify-center py-20"><Spinner size="lg" /></div>}
            {postsError && <div className="bg-red-100 border-l-4 border-red-500 text-red-700 p-4 rounded-md shadow"><p>{postsError}</p></div>}
            {!isFetchingPosts && sortedPosts.length === 0 && (
                <div className="text-center py-20 bg-white dark:bg-gray-800/50 rounded-lg shadow-md">
                    <h2 className="text-xl font-semibold">No {postTypeToShow} posts found.</h2>
                </div>
            )}

            <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 2xl:grid-cols-5 gap-6">
                {sortedPosts.map(post => {
                    const isClickable = postTypeToShow === 'published' && post.permalink_url;
                    return (
                        <div 
                            key={post.id}
                            onClick={(e) => handleCardClick(e, post)}
                            className={`bg-white dark:bg-gray-800 rounded-xl shadow-lg border border-gray-200 dark:border-gray-700 overflow-hidden flex flex-col ${isClickable ? 'cursor-pointer transition-all duration-200 ease-in-out hover:shadow-2xl hover:-translate-y-1' : ''}`}
                        >
                            <div className="w-full aspect-square bg-gray-200 dark:bg-gray-700">
                               {post.full_picture !== undefined ? (
                                    post.full_picture ? 
                                    <img src={post.full_picture} alt="" className="w-full h-full object-cover" loading="lazy" /> : 
                                    <div className="w-full h-full flex items-center justify-center text-gray-500 text-sm p-4 text-center">No Image Available</div>
                               ) : (
                                   <div className="w-full h-full flex items-center justify-center">
                                       <Spinner size="md" />
                                   </div>
                               )}
                            </div>
                            <div className="p-4 flex-grow flex flex-col justify-between">
                                <div>
                                   <p className="text-sm text-gray-600 dark:text-gray-300 mb-3 break-words">{post.message ? post.message.substring(0, 150) + (post.message.length > 150 ? '...' : '') : 'No caption.'}</p>
                                    <p className="text-xs text-gray-400 dark:text-gray-500">
                                        {post.created_time ? new Date(post.created_time).toLocaleString() : post.scheduled_publish_time ? `Scheduled: ${new Date(post.scheduled_publish_time * 1000).toLocaleString()}`: ''}
                                    </p>
                                </div>
                                {postTypeToShow === 'published' && (
                                    <div className="mt-4">
                                        <div className="flex justify-around items-center text-xs text-gray-600 dark:text-gray-400 border-t border-gray-200 dark:border-gray-700 pt-3">
                                            <span className="flex items-center gap-1"><ThumbsUpIcon className="w-4 h-4"/>{post.likes?.summary?.total_count ?? 0}</span>
                                            <span className="flex items-center gap-1"><ChatBubbleIcon className="w-4 h-4"/>{post.comments?.summary?.total_count ?? 0}</span>
                                            <span className="flex items-center gap-1"><EyeIcon className="w-4 h-4"/>{post.insights?.data?.[0]?.values?.[0]?.value?.toLocaleString() ?? 0}</span>
                                        </div>
                                        {(post.comments?.summary?.total_count ?? 0) > 0 && (
                                            <button 
                                                onClick={() => handleAiReplyToAll(post)}
                                                disabled={!!replyingPostId}
                                                className="w-full mt-3 py-1.5 px-2 text-xs font-semibold text-white bg-purple-500 rounded-md hover:bg-purple-600 disabled:opacity-50 flex items-center justify-center gap-1.5 transition-all">
                                                {replyingPostId === post.id ? <Spinner size="sm"/> : <GenerateIcon className="w-3 h-3"/>}
                                                {replyingPostId === post.id ? "Replying..." : "AI Reply"}
                                            </button>
                                        )}
                                    </div>
                                )}
                            </div>
                        </div>
                    );
                })}
            </div>
            
            {postTypeToShow === 'published' && !isFetchingPosts && nextPageUrl && (
                <div className="mt-8 text-center">
                    <button
                        onClick={() => handleFetchPosts(activePage, 'published', nextPageUrl)}
                        disabled={isFetchingMore}
                        className="px-6 py-3 bg-primary text-primary-text font-semibold rounded-md hover:bg-primary-hover shadow-md hover:shadow-lg transition-all transform hover:-translate-y-px disabled:opacity-50 flex items-center justify-center gap-2 mx-auto"
                    >
                        {isFetchingMore ? <Spinner size="sm" /> : 'Load More Posts'}
                    </button>
                </div>
            )}

            {isDeleteAllModalOpen && (
                <div className="fixed inset-0 bg-black/60 z-50 flex items-center justify-center p-4">
                    <div className="bg-white dark:bg-gray-800 rounded-lg shadow-xl p-6 w-full max-w-md">
                        <h3 className="text-lg font-bold text-red-600">Confirm Deletion</h3>
                        <p className="mt-2 text-sm text-gray-600 dark:text-gray-300">
                            Are you sure you want to delete all <strong>{publishedPosts.length}</strong> loaded published posts? This action is irreversible.
                        </p>
                        {isDeletingAll && (
                            <div className="mt-4">
                                <div className="w-full bg-gray-200 rounded-full h-2.5 dark:bg-gray-700">
                                    <div className="bg-red-600 h-2.5 rounded-full" style={{ width: `${deleteAllProgress.total > 0 ? (deleteAllProgress.current / deleteAllProgress.total) * 100 : 0}%` }}></div>
                                </div>
                                <p className="text-center text-sm mt-2">{deleteAllProgress.current} / {deleteAllProgress.total} deleted</p>
                            </div>
                        )}
                        <div className="mt-6 flex justify-end gap-3">
                            <button onClick={() => setIsDeleteAllModalOpen(false)} disabled={isDeletingAll} className="px-4 py-2 text-sm font-medium rounded-md bg-gray-200 dark:bg-gray-600 hover:bg-gray-300 dark:hover:bg-gray-500 disabled:opacity-50">
                                Cancel
                            </button>
                            <button onClick={handleConfirmDeleteAll} disabled={isDeletingAll} className="px-4 py-2 text-sm font-medium rounded-md bg-red-600 text-white hover:bg-red-700 disabled:opacity-50 flex items-center gap-2">
                                {isDeletingAll ? <Spinner size="sm"/> : <TrashIcon className="w-4 h-4"/>}
                                {isDeletingAll ? 'Deleting...' : 'Delete All'}
                            </button>
                        </div>
                    </div>
                </div>
            )}
        </div>
    );
};

// --- PARENT COMPONENT WITH AUTH LOGIC ---
const ManagePostsPage: React.FC = () => {
    const { addNotification } = useNotification();
    
    const [accessToken, setAccessToken] = useState<string>(() => localStorage.getItem(ACCESS_TOKEN_KEY) || '');
    const [pages, setPages] = useState<FBPage[]>(() => {
        try { return JSON.parse(localStorage.getItem(PAGES_KEY) || '[]'); } catch { return []; }
    });
    const [activePage, setActivePage] = useState<FBPage | null>(null);
    const [isLoading, setIsLoading] = useState(false);
    const [loginError, setLoginError] = useState<string | null>(null);

    const handleLogout = useCallback(() => {
        localStorage.removeItem(ACCESS_TOKEN_KEY);
        localStorage.removeItem(PAGES_KEY);
        setAccessToken(''); setPages([]); setActivePage(null); setLoginError(null);
        addNotification('You have been logged out.', 'info');
    }, [addNotification]);

    const handleFetchPages = useCallback(async () => {
        if (!accessToken) { addNotification('Please enter a User Access Token.', 'error'); return; }
        setIsLoading(true); setLoginError(null);
        try {
            const response = await fetch(`https://graph.facebook.com/${API_VERSION}/me/accounts?fields=id,name,access_token&access_token=${accessToken}`);
            const data = await response.json();
            if (data.error) throw new Error(data.error.message);
            const fetchedPages: FBPage[] = data.data || [];
            setPages(fetchedPages);
            localStorage.setItem(ACCESS_TOKEN_KEY, accessToken);
            localStorage.setItem(PAGES_KEY, JSON.stringify(fetchedPages));
            if (fetchedPages.length > 0) {
                setActivePage(fetchedPages[0]);
                addNotification('Successfully connected to Facebook!', 'success');
            } else {
                setLoginError("No pages found for this access token.");
                addNotification("No pages found for this access token.", 'error');
            }
        } catch (e: any) {
            const message = (e.message || '').toLowerCase();
            if (message.includes('session') || message.includes('token') || message.includes('oauth')) {
                 setLoginError(`Facebook connection failed: ${e.message}. The token might be invalid or expired. Please provide a new one.`);
                 handleLogout();
            } else {
                setLoginError(`Failed to fetch pages: ${e.message}.`);
                addNotification(`Failed to fetch pages: ${e.message}.`, 'error');
            }
        } finally {
            setIsLoading(false);
        }
    }, [accessToken, handleLogout, addNotification]);

    useEffect(() => {
        if (accessToken && pages.length === 0) handleFetchPages();
        else if (pages.length > 0 && !activePage) setActivePage(pages[0]);
    }, [accessToken, pages, activePage, handleFetchPages]);

    if (!accessToken || pages.length === 0) {
        return (
            <div className="flex items-center justify-center min-h-[calc(100vh-10rem)]">
                <div className="w-full max-w-md p-8 space-y-6 bg-white dark:bg-gray-800/50 rounded-2xl shadow-2xl text-center">
                    <FacebookIcon className="mx-auto h-12 w-12 text-blue-500" />
                    <h2 className="text-3xl font-bold">Connect to Facebook</h2>
                    <p className="text-gray-500 dark:text-gray-400">Enter your User Access Token to manage your posts.</p>
                    {loginError && <p className="text-red-500 bg-red-100 dark:bg-red-900/30 p-3 rounded-md">{loginError}</p>}
                    <div>
                        <input id="accessToken" type="password" value={accessToken} onChange={(e) => setAccessToken(e.target.value)} placeholder="Paste your token here" className="w-full p-3 text-center bg-gray-100 dark:bg-gray-700 rounded-md focus:ring-2 focus:ring-primary"/>
                        <a href="https://developers.facebook.com/tools/explorer/" target="_blank" rel="noopener noreferrer" className="text-xs text-primary/80 hover:text-primary mt-2 block">How to get a token?</a>
                    </div>
                    <button onClick={handleFetchPages} disabled={isLoading} className="w-full py-3 font-semibold text-white bg-blue-600 rounded-md hover:bg-blue-700 disabled:opacity-50 flex items-center justify-center">
                        {isLoading ? <Spinner size="sm" /> : 'Connect'}
                    </button>
                </div>
            </div>
        );
    }
    
    return (
         <div className="p-4 md:p-6 lg:p-8 space-y-6">
            <div className="flex flex-wrap items-center justify-between gap-4 p-4 bg-white dark:bg-gray-800/80 backdrop-blur-sm rounded-xl shadow-lg border border-gray-200 dark:border-gray-700/50">
                <div>
                    <h1 className="text-2xl font-bold">Manage Facebook Posts</h1>
                    <p className="text-sm text-gray-500 dark:text-gray-400">View, sort, and interact with your page's content.</p>
                </div>
                <div className="flex items-center gap-4">
                    <select value={activePage?.id || ''} onChange={(e) => setActivePage(pages.find(p => p.id === e.target.value) || null)} className="w-full md:w-56 p-2 text-sm bg-gray-50 dark:bg-gray-700 border rounded-md focus:ring-2 focus:ring-primary">
                        {pages.map(page => <option key={page.id} value={page.id}>{page.name}</option>)}
                    </select>
                    <button onClick={handleLogout} className="px-4 py-2 text-sm font-medium bg-red-600 text-white rounded-md hover:bg-red-700">Logout</button>
                </div>
            </div>
            {activePage && <ManagePostsContent activePage={activePage} onAuthError={handleLogout} />}
        </div>
    );
};

export default ManagePostsPage;
