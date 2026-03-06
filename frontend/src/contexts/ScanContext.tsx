import React, { createContext, useContext, useEffect, useState, ReactNode } from 'react';

export type KeywordType = 'email' | 'password' | 'phone' | 'creditcard' | 'username' | 'custom';

export interface Keyword {
  id: string;
  value: string;
  type: KeywordType;
}

export interface ScanResult {
  id: string;
  userId: string;
  userEmail?: string;
  keywords: Keyword[];
  status: 'safe' | 'breached' | 'error';
  breachedSites?: string[];
  matchedKeywords?: string[];
  breachedMatches?: { site: string; keyword: string }[];
  safeSites?: string[];
  safeKeywords?: string[];
  crawlStats?: Array<{ url: string; pages_scanned: number; max_depth_reached: number; time_elapsed: number }>;
  scannedAt: Date;
  scanDuration: number;
}

export interface ScanSettingsRange {
  min: number;
  max: number;
  default: number;
}

export interface ScanModel {
  pages: number;
  depth: number;
  time_limit_seconds: number;
  min_priority_to_expand: number;
  requests_per_minute: number;
  request_timeout_seconds: number;
}

export interface ScanSettings {
  pages: ScanSettingsRange;
  depth: ScanSettingsRange;
  time_limit_seconds: ScanSettingsRange;
  min_priority_to_expand: ScanSettingsRange;
  include_subdomains: boolean;
  requests_per_minute: ScanSettingsRange;
  request_timeout_seconds: ScanSettingsRange;
  models?: {
    efficiency: ScanModel;
    balanced: ScanModel;
    accuracy: ScanModel;
  };
}

export interface DarkWebLink {
  id: string;
  url: string;
  name: string;
  status: 'enabled' | 'disabled';
  lastChecked?: Date;
  addedAt: Date;
}

interface ScanContextType {
  keywords: Keyword[];
  addKeyword: (value: string, type: KeywordType) => void;
  removeKeyword: (id: string) => void;
  clearKeywords: () => void;
  scanHistory: ScanResult[];
  addScanResult: (result: Omit<ScanResult, 'id'>) => void;
  clearHistory: () => void;
  darkWebLinks: DarkWebLink[];
  addDarkWebLink: (url: string, name: string) => Promise<void>;
  updateDarkWebLink: (id: string, updates: Partial<DarkWebLink>) => Promise<void>;
  removeDarkWebLink: (id: string) => Promise<void>;
  toggleDarkWebLink: (id: string) => Promise<void>;
  getAllScanHistory: () => ScanResult[];
  syncDarkWebLinks: () => Promise<void>;
  scanSettings: ScanSettings | null;
  refreshScanSettings: () => Promise<void>;
  updateScanSettings: (settings: ScanSettings) => Promise<void>;
  scanModel: 'efficiency' | 'balanced' | 'accuracy';
  setScanModel: (model: 'efficiency' | 'balanced' | 'accuracy') => void;
}

const ScanContext = createContext<ScanContextType | undefined>(undefined);

const API_BASE_URL = 'http://localhost:5000';
const DARK_WEB_LINKS_STORAGE_KEY = 'spi-trace-dark-web-links';

// Mock dark web links
const INITIAL_DARK_WEB_LINKS: DarkWebLink[] = [
  { id: '1', url: 'darkforum.onion', name: 'Dark Forum', status: 'enabled', addedAt: new Date('2024-01-15'), lastChecked: new Date() },
  { id: '2', url: 'shadowmarket.onion', name: 'Shadow Market', status: 'enabled', addedAt: new Date('2024-01-20'), lastChecked: new Date() },
  { id: '3', url: 'hackersbay.onion', name: 'Hackers Bay', status: 'enabled', addedAt: new Date('2024-02-01'), lastChecked: new Date() },
  { id: '4', url: 'leakeddatabase.onion', name: 'Leaked Database', status: 'disabled', addedAt: new Date('2024-02-10'), lastChecked: new Date() },
  { id: '5', url: 'underground.onion', name: 'Underground', status: 'enabled', addedAt: new Date('2024-02-15'), lastChecked: new Date() },
];

// Mock scan history
const INITIAL_SCAN_HISTORY: ScanResult[] = [
  {
    id: '1',
    userId: '2',
    userEmail: 'user@example.com',
    keywords: [{ id: '1', value: 'user@example.com', type: 'email' }],
    status: 'breached',
    breachedSites: ['Dark Forum', 'Shadow Market'],
    matchedKeywords: ['user@example.com'],
    scannedAt: new Date('2024-02-01'),
    scanDuration: 45,
  },
  {
    id: '2',
    userId: '2',
    userEmail: 'user@example.com',
    keywords: [{ id: '2', value: '555-1234', type: 'phone' }],
    status: 'safe',
    scannedAt: new Date('2024-02-10'),
    scanDuration: 38,
  },
  {
    id: '3',
    userId: '3',
    userEmail: 'jane@company.com',
    keywords: [
      { id: '3', value: 'jane@company.com', type: 'email' },
      { id: '4', value: 'janedoe', type: 'username' },
    ],
    status: 'breached',
    breachedSites: ['Hackers Bay'],
    matchedKeywords: ['jane@company.com'],
    scannedAt: new Date('2024-02-12'),
    scanDuration: 52,
  },
];

export function ScanProvider({ children }: { children: ReactNode }) {
  const [keywords, setKeywords] = useState<Keyword[]>([]);
  const [scanHistory, setScanHistory] = useState<ScanResult[]>(INITIAL_SCAN_HISTORY);
  const [darkWebLinks, setDarkWebLinks] = useState<DarkWebLink[]>(INITIAL_DARK_WEB_LINKS);
  const [scanSettings, setScanSettings] = useState<ScanSettings | null>(null);
  const [scanModel, setScanModel] = useState<'efficiency' | 'balanced' | 'accuracy'>('balanced');

  useEffect(() => {
    try {
      const stored = localStorage.getItem(DARK_WEB_LINKS_STORAGE_KEY);
      if (stored) {
        const parsed = JSON.parse(stored) as DarkWebLink[];
        const hydrated = parsed.map((link) => ({
          ...link,
          addedAt: new Date(link.addedAt),
          lastChecked: link.lastChecked ? new Date(link.lastChecked) : undefined,
        }));
        setDarkWebLinks(hydrated);
      }
    } catch {
      setDarkWebLinks(INITIAL_DARK_WEB_LINKS);
    }
  }, []);

  useEffect(() => {
    const loadSettings = async () => {
      try {
        const response = await fetch(`${API_BASE_URL}/api/scan-settings`);
        if (!response.ok) {
          throw new Error('Failed to load scan settings');
        }
        const data = await response.json();
        setScanSettings(data.settings as ScanSettings);
      } catch (error) {
        console.error('[ScanContext] load scan settings failed', error);
      }
    };
    loadSettings();
  }, []);

  const persistDarkWebLinks = (links: DarkWebLink[]) => {
    localStorage.setItem(DARK_WEB_LINKS_STORAGE_KEY, JSON.stringify(links));
  };

  const normalizeLinks = (links: any[]): DarkWebLink[] =>
    links.map((link) => ({
      id: String(link.id),
      url: link.url,
      name: link.name,
      status: link.status === 'disabled' ? 'disabled' : 'enabled',
      addedAt: new Date(link.addedAt),
      lastChecked: link.lastChecked ? new Date(link.lastChecked) : undefined,
    }));

  const addKeyword = (value: string, type: KeywordType) => {
    const trimmedValue = value.trim();
    if (!trimmedValue) return;
    
    // Check for duplicates
    if (keywords.some(k => k.value.toLowerCase() === trimmedValue.toLowerCase())) return;
    
    const newKeyword: Keyword = {
      id: Date.now().toString(),
      value: trimmedValue,
      type,
    };
    setKeywords(prev => [...prev, newKeyword]);
  };

  const removeKeyword = (id: string) => {
    setKeywords(prev => prev.filter(k => k.id !== id));
  };

  const clearKeywords = () => {
    setKeywords([]);
  };

  const addScanResult = (result: Omit<ScanResult, 'id'>) => {
    const newResult: ScanResult = {
      ...result,
      id: Date.now().toString(),
    };
    setScanHistory(prev => [newResult, ...prev]);
  };

  const clearHistory = () => {
    setScanHistory([]);
  };

  const syncDarkWebLinks = async () => {
    const response = await fetch(`${API_BASE_URL}/api/urls`);
    if (!response.ok) {
      throw new Error('Failed to load URLs from backend');
    }
    const data = await response.json();
    const normalized = normalizeLinks(Array.isArray(data.urls) ? data.urls : []);
    setDarkWebLinks(normalized);
    persistDarkWebLinks(normalized);
  };

  const addDarkWebLink = async (url: string, name: string) => {
    const response = await fetch(`${API_BASE_URL}/api/urls`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ url, name }),
    });
    if (!response.ok) {
      throw new Error('Failed to add URL');
    }
    const data = await response.json();
    const normalized = normalizeLinks([data.url]);
    const updated = [...darkWebLinks, normalized[0]];
    setDarkWebLinks(updated);
    persistDarkWebLinks(updated);
  };

  const updateDarkWebLink = async (id: string, updates: Partial<DarkWebLink>) => {
    const response = await fetch(`${API_BASE_URL}/api/urls/${id}`, {
      method: 'PUT',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        url: updates.url,
        name: updates.name,
        status: updates.status,
      }),
    });
    if (!response.ok) {
      throw new Error('Failed to update URL');
    }
    const data = await response.json();
    const normalized = normalizeLinks([data.url]);
    const updated = darkWebLinks.map((link) =>
      link.id === id ? normalized[0] : link
    );
    setDarkWebLinks(updated);
    persistDarkWebLinks(updated);
  };

  const removeDarkWebLink = async (id: string) => {
    const response = await fetch(`${API_BASE_URL}/api/urls/${id}`, {
      method: 'DELETE',
    });
    if (!response.ok) {
      throw new Error('Failed to remove URL');
    }
    const updated = darkWebLinks.filter((link) => link.id !== id);
    setDarkWebLinks(updated);
    persistDarkWebLinks(updated);
  };

  const toggleDarkWebLink = async (id: string) => {
    const response = await fetch(`${API_BASE_URL}/api/urls/${id}/toggle`, {
      method: 'PATCH',
    });
    if (!response.ok) {
      throw new Error('Failed to toggle URL');
    }
    const data = await response.json();
    const normalized = normalizeLinks([data.url]);
    const updated = darkWebLinks.map((link) =>
      link.id === id ? normalized[0] : link
    );
    setDarkWebLinks(updated);
    persistDarkWebLinks(updated);
  };

  const getAllScanHistory = () => scanHistory;

  const refreshScanSettings = async () => {
    const response = await fetch(`${API_BASE_URL}/api/scan-settings`);
    if (!response.ok) {
      throw new Error('Failed to load scan settings');
    }
    const data = await response.json();
    setScanSettings(data.settings as ScanSettings);
  };

  const updateScanSettings = async (settings: ScanSettings) => {
    const response = await fetch(`${API_BASE_URL}/api/scan-settings`, {
      method: 'PUT',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(settings),
    });
    if (!response.ok) {
      throw new Error('Failed to update scan settings');
    }
    const data = await response.json();
    setScanSettings(data.settings as ScanSettings);
  };

  return (
    <ScanContext.Provider
      value={{
        keywords,
        addKeyword,
        removeKeyword,
        clearKeywords,
        scanHistory,
        addScanResult,
        clearHistory,
        darkWebLinks,
        addDarkWebLink,
        updateDarkWebLink,
        removeDarkWebLink,
        toggleDarkWebLink,
        getAllScanHistory,
        syncDarkWebLinks,
        scanSettings,
        refreshScanSettings,
        updateScanSettings,
        scanModel,
        setScanModel,
      }}
    >
      {children}
    </ScanContext.Provider>
  );
}

export function useScan() {
  const context = useContext(ScanContext);
  if (context === undefined) {
    throw new Error('useScan must be used within a ScanProvider');
  }
  return context;
}
