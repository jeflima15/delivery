import { clsx, type ClassValue } from 'clsx';
import { twMerge } from 'tailwind-merge';
import { getStoreStatusDetails, computeIsStoreOpen } from './storeStatus';

export function cn(...inputs: ClassValue[]) {
  return twMerge(clsx(inputs));
}

export function getStoreStatus(storeInfo: any) {
  return getStoreStatusDetails(storeInfo);
}

export { computeIsStoreOpen, getStoreStatusDetails };

