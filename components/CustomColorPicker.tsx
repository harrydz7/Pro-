
import React, { useRef, useEffect } from 'react';

interface CustomColorPickerProps {
  value: string;
  onChange: (color: string) => void;
  isOpen: boolean;
  onToggle: () => void;
  className?: string;
  label?: string;
}

const CustomColorPicker: React.FC<CustomColorPickerProps> = ({ value, onChange, isOpen, onToggle, className, label }) => {
  const wrapperRef = useRef<HTMLDivElement>(null);

  const handleClickOutside = (event: MouseEvent) => {
    if (wrapperRef.current && !wrapperRef.current.contains(event.target as Node)) {
      if (isOpen) {
        onToggle(); // Close it
      }
    }
  };

  useEffect(() => {
    if (isOpen) {
      document.addEventListener('mousedown', handleClickOutside);
    } else {
      document.removeEventListener('mousedown', handleClickOutside);
    }
    return () => {
      document.removeEventListener('mousedown', handleClickOutside);
    };
  }, [isOpen, onToggle]);

  return (
    <div className={`relative ${className || ''}`} ref={wrapperRef}>
      {/* Swatch button to toggle the picker */}
      <button
        type="button"
        className="w-full h-8 p-1 border rounded-md dark:border-gray-600 focus:outline-none focus:ring-2 focus:ring-primary"
        style={{ backgroundColor: value }}
        onClick={onToggle}
        aria-label={`${label || 'Color picker'}, current color ${value}`}
      />
      {/* Popover */}
      {isOpen && (
        <div 
          className="absolute z-50 top-full mt-2 p-3 bg-white dark:bg-gray-800 rounded-lg shadow-xl border border-gray-300 dark:border-gray-600"
          // Stop propagation to prevent handleClickOutside from firing when clicking inside the popover
          onMouseDown={e => e.stopPropagation()}
        >
          {/* Native color input */}
          <input
            type="color"
            value={value}
            // Use onInput for continuous update as user drags in the picker
            onInput={(e) => onChange((e.target as HTMLInputElement).value)}
            className="w-24 h-12 p-0 border-none cursor-pointer bg-transparent"
          />
          {/* Hex text input for precision */}
          <input
            type="text"
            value={value}
            onChange={(e) => onChange(e.target.value)}
            className="w-full mt-2 p-1 text-center border rounded-md bg-gray-50 dark:bg-gray-700 dark:border-gray-500"
          />
        </div>
      )}
    </div>
  );
};

export default CustomColorPicker;
