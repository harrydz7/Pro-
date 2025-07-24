import React, { useRef } from 'react';
import { ViralPost } from '../types.ts';
import Spinner from './Spinner.tsx';
import { DownloadIcon } from './IconComponents.tsx';

interface ViralPostCardProps {
  post: ViralPost;
  onDownload: (cardElement: HTMLElement, title: string) => void;
}

const ViralPostCard: React.FC<ViralPostCardProps> = ({ post, onDownload }) => {
  const cardRef = useRef<HTMLDivElement>(null);

  const handleDownload = () => {
    if (cardRef.current) {
      onDownload(cardRef.current, post.topic);
    }
  };

  return (
    <div className="flex flex-col">
        <div 
          ref={cardRef}
          className="viral-post-card-container rounded-lg shadow-lg overflow-hidden bg-white dark:bg-gray-800 flex flex-col"
        >
          {/* Image and Headline container */}
          <div className="relative w-full aspect-square bg-gray-700">
            {post.isLoading && (
              <div className="absolute inset-0 bg-black/50 flex flex-col items-center justify-center z-20">
                <Spinner color="text-white" />
                <p className="mt-2 text-sm">Generating Viral Post...</p>
                <p className="mt-1 text-xs opacity-80">Topic: {post.topic}</p>
              </div>
            )}
            {post.error && (
              <div className="absolute inset-0 bg-red-800/80 flex flex-col items-center justify-center text-center p-4 z-20">
                <p className="font-bold">Generation Failed</p>
                <p className="text-sm mt-1">{post.error}</p>
              </div>
            )}

            {post.imageUrl && (
              <img 
                src={post.imageUrl} 
                alt={post.topic}
                className="absolute inset-0 w-full h-full object-cover z-0"
                crossOrigin="anonymous"
              />
            )}
            
            {/* Gradient for headline readability */}
            <div className="absolute inset-x-0 top-0 h-1/2 bg-gradient-to-b from-black/70 via-black/30 to-transparent z-10"></div>
            
            <div className="absolute inset-x-0 bottom-0 h-1/2 bg-gradient-to-t from-black/70 via-black/30 to-transparent z-10"></div>

            <div className="relative z-20 flex flex-col justify-center items-center h-full p-4 text-white">
                <h2 
                    className="text-center font-teko font-bold text-4xl md:text-5xl lg:text-6xl"
                    style={{ textShadow: '3px 3px 8px rgba(0,0,0,0.9)' }}
                >
                    {post.headline}
                </h2>
            </div>
          </div>
          
          {/* Summary container */}
          <div className="p-4 border-t border-gray-200 dark:border-gray-700 bg-gray-50 dark:bg-gray-750">
              <p 
                  className="text-center text-base md:text-lg font-sans font-medium text-gray-800 dark:text-gray-200"
              >
                  {post.summary}
              </p>
          </div>
        </div>
        <div className="no-screenshot p-2">
             <button 
                onClick={handleDownload} 
                disabled={post.isLoading || !!post.error || !post.imageUrl}
                className="w-full flex items-center justify-center gap-2 p-2 rounded-md bg-green-600 text-white hover:bg-green-700 disabled:opacity-50 transition-colors"
            >
                <DownloadIcon className="w-5 h-5" />
                <span>Download Post</span>
            </button>
        </div>
    </div>
  );
};

export default ViralPostCard;