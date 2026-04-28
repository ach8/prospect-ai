import { clsx, type ClassValue } from 'clsx';
import { twMerge } from 'tailwind-merge';

/**
 * Merge Tailwind CSS classes with clsx
 * Used across all components for conditional class composition
 */
export function cn(...inputs: ClassValue[]) {
  return twMerge(clsx(inputs));
}
