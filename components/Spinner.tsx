
import React from 'react';

interface SpinnerProps {
  size?: 'sm' | 'md' | 'lg';
  color?: string; // Tailwind text color class, e.g., 'text-blue-600'
  className?: string;
}

const Spinner: React.FC<SpinnerProps> = ({ 
  size = 'md', 
  color = 'text-blue-600 dark:text-blue-400', 
  className = '' 
}) => {
  const sizeClasses = {
    sm: 'h-5 w-5 border-2',
    md: 'h-8 w-8 border-4',
    lg: 'h-12 w-12 border-4',
  };

  return (
    <div
      role="status"
      aria-label="Loading..."
      className={`animate-spin rounded-full border-solid ${sizeClasses[size]} ${color} ${className}`}
      style={{ borderTopColor: 'transparent' }}
    >
      <span className="sr-only">Loading...</span>
    </div>
  );
};

export default Spinner;
