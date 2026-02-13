import { useState, useEffect, useRef } from 'react';
import { motion } from 'framer-motion';
import { useScan } from '@/contexts/ScanContext';
import { Wifi, Globe, Database, Search, Shield, Check } from 'lucide-react';

interface ScanProgressProps {
  isScanning: boolean;
  scanToken: number;
  scanModel?: 'efficiency' | 'balanced' | 'accuracy';
  onComplete: (
    status: 'safe' | 'breached' | 'error',
    breachedSites?: string[],
    matchedKeywords?: string[],
    breachedMatches?: { site: string; keyword: string }[],
    safeSites?: string[],
    crawlStats?: Array<{ url: string; pages_scanned: number; max_depth_reached: number; time_elapsed: number }>
  ) => void;
  onError?: (message: string) => void;
  onCancel?: () => void;
}

const scanSteps = [
  { label: 'Connecting to dark web sources...', icon: Wifi, duration: 2000 },
  { label: 'Scanning enabled sources...', icon: Globe, duration: 3000 },
  { label: 'Searching leaked databases...', icon: Database, duration: 2500 },
  { label: 'Matching keywords...', icon: Search, duration: 2000 },
  { label: 'Analyzing results...', icon: Shield, duration: 1500 },
];

const MAX_SCAN_DURATION_MS = 120000;
const SLOW_SCAN_WARNING_MS = 60000;

export function ScanProgress({ isScanning, scanToken, scanModel = 'balanced', onComplete, onError, onCancel }: ScanProgressProps) {
  const { darkWebLinks, keywords, scanSettings } = useScan();
  const enabledLinks = darkWebLinks.filter((l) => l.status === 'enabled');
  const resultRef = useRef<{
    matches: { keyword: string; url: string }[];
  } | null>(null);
  const errorRef = useRef<string | null>(null);
  const doneRef = useRef(false);
  const canceledRef = useRef(false);
  const abortRef = useRef<AbortController | null>(null);
  const scanIdRef = useRef<string | null>(null);
  const pollRef = useRef<NodeJS.Timeout | null>(null);
  const timeoutRef = useRef<NodeJS.Timeout | null>(null);
  
  const [currentStep, setCurrentStep] = useState(0);
  const [progress, setProgress] = useState(0);
  const [scanningLink, setScanningLink] = useState(0);
  const [warning, setWarning] = useState<string | null>(null);
  const [slowWarnShown, setSlowWarnShown] = useState(false);

  useEffect(() => {
    if (!isScanning) {
      setCurrentStep(0);
      setProgress(0);
      setScanningLink(0);
      setWarning(null);
      setSlowWarnShown(false);
      resultRef.current = null;
      errorRef.current = null;
      doneRef.current = false;
      canceledRef.current = false;
      scanIdRef.current = null;
      if (pollRef.current) {
        clearInterval(pollRef.current);
        pollRef.current = null;
      }
      if (timeoutRef.current) {
        clearTimeout(timeoutRef.current);
        timeoutRef.current = null;
      }
      if (abortRef.current) {
        abortRef.current.abort();
        abortRef.current = null;
      }
      return;
    }

    const enabledSnapshot = enabledLinks.map((link) => link.url);
    const keywordSnapshot = keywords.map((k) => k.value);

    const startScan = async () => {
      if (enabledSnapshot.length === 0) {
        errorRef.current = 'No enabled sources found. Ask an admin to enable sources.';
        doneRef.current = true;
        return;
      }
      try {
        abortRef.current = new AbortController();
        
        // Get model-specific settings from scanSettings or use defaults
        const defaultModelSettings = {
          efficiency: {
            max_pages: 1,
            max_depth: 0,
            time_limit_seconds: 5,
            min_priority_to_expand: 6,
            requests_per_minute: 50,
            request_timeout_seconds: 3,
          },
          balanced: {
            max_pages: 2,
            max_depth: 1,
            time_limit_seconds: 15,
            min_priority_to_expand: 3,
            requests_per_minute: 20,
            request_timeout_seconds: 8,
          },
          accuracy: {
            max_pages: 4,
            max_depth: 2,
            time_limit_seconds: 50,
            min_priority_to_expand: 0,
            requests_per_minute: 5,
            request_timeout_seconds: 45,
          },
        };
        
        // Use scanSettings.models if available, otherwise fallback to defaults
        const modelSettings = scanSettings?.models;
        const selectedModel = modelSettings 
          ? {
              max_pages: modelSettings[scanModel].pages,
              max_depth: modelSettings[scanModel].depth,
              time_limit_seconds: modelSettings[scanModel].time_limit_seconds,
              min_priority_to_expand: modelSettings[scanModel].min_priority_to_expand,
              requests_per_minute: modelSettings[scanModel].requests_per_minute,
              request_timeout_seconds: modelSettings[scanModel].request_timeout_seconds,
            }
          : defaultModelSettings[scanModel];
        
        const response = await fetch('http://localhost:5000/scan', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          signal: abortRef.current.signal,
          body: JSON.stringify({
            keywords: keywordSnapshot.join(','),
            urls: enabledSnapshot,
            max_pages: selectedModel.max_pages,
            max_depth: selectedModel.max_depth,
            time_limit_seconds: selectedModel.time_limit_seconds,
            min_priority_to_expand: selectedModel.min_priority_to_expand,
            include_subdomains: scanSettings?.include_subdomains || true,
          }),
        });

        if (!response.ok) {
          throw new Error('Scan request failed');
        }

        const data = await response.json();
        scanIdRef.current = data.scan_id as string;
      } catch (error) {
        if (!canceledRef.current) {
          if (error instanceof DOMException && error.name === 'AbortError') {
            errorRef.current = 'Scan request was canceled.';
          } else {
            errorRef.current = error instanceof Error ? error.message : String(error);
          }
          doneRef.current = true;
          onError?.(errorRef.current);
        }
      }
    };

    const pollStatus = async () => {
      if (!scanIdRef.current || canceledRef.current) {
        return;
      }
      try {
        const response = await fetch(`http://localhost:5000/scan-status/${scanIdRef.current}`);
        if (!response.ok) {
          throw new Error('Failed to fetch scan status');
        }
        const data = await response.json();
        if (data.status === 'complete') {
          resultRef.current = {
            matches: Array.isArray(data.matches) ? data.matches : [],
            stats: Array.isArray(data.stats) ? data.stats : [],
          };
          doneRef.current = true;
          setProgress(100);
          setCurrentStep(scanSteps.length - 1);
          setWarning(null);
          if (pollRef.current) {
            clearInterval(pollRef.current);
            pollRef.current = null;
          }
        }
      } catch (error) {
        if (!canceledRef.current) {
          errorRef.current = error instanceof Error ? error.message : String(error);
          doneRef.current = true;
          if (pollRef.current) {
            clearInterval(pollRef.current);
            pollRef.current = null;
          }
        }
      }
    };

    startScan().then(() => {
      if (!canceledRef.current && scanIdRef.current) {
        pollRef.current = setInterval(pollStatus, 3000);
      }
    });

    timeoutRef.current = setTimeout(() => {
      if (doneRef.current || canceledRef.current) {
        return;
      }
      if (!slowWarnShown) {
        setWarning('Scan is taking longer than expected due to accuracy settings. Still working in the background...');
        setSlowWarnShown(true);
      }
    }, MAX_SCAN_DURATION_MS);

    const slowWarnTimeoutRef = setTimeout(() => {
      if (doneRef.current || canceledRef.current || slowWarnShown) {
        return;
      }
      setWarning('Scanning deep into pages for maximum accuracy. This may take a minute...');
      setSlowWarnShown(true);
    }, SLOW_SCAN_WARNING_MS);

    let stepTimeout: NodeJS.Timeout;
    let progressInterval: NodeJS.Timeout;

    const runStep = (stepIndex: number) => {
      if (stepIndex >= scanSteps.length) {
        const finalize = () => {
          if (!doneRef.current) {
            setTimeout(finalize, 300);
            return;
          }

          if (canceledRef.current) {
            return;
          }

          if (errorRef.current || !resultRef.current) {
            const message = errorRef.current || 'Scan failed. Please try again.';
            console.error(message);
            onError?.(message);
            onComplete('error');
            return;
          }

          const urlToName = new Map(
            enabledLinks.map((link) => [link.url, link.name])
          );
          const matches = resultRef.current.matches;
          const stats = (resultRef.current as any).stats || [];
          
          if (matches.length === 0) {
            const safeSites = enabledLinks.map((link) => link.name || link.url);
            onComplete('safe', [], [], [], safeSites, stats);
            return;
          }

          const breachedSites = Array.from(
            new Set(matches.map((match) => urlToName.get(match.url) || match.url))
          );
          const matchedKw = Array.from(
            new Set(matches.map((match) => match.keyword))
          );
          const breachedMatches = Array.from(
            new Map(
              matches.map((match) => {
                const site = urlToName.get(match.url) || match.url;
                return [`${site}::${match.keyword}`, { site, keyword: match.keyword }];
              })
            ).values()
          );
          const safeSites = enabledLinks
            .filter((link) => !breachedSites.includes(link.name || link.url))
            .map((link) => link.name || link.url);
          onComplete('breached', breachedSites, matchedKw, breachedMatches, safeSites, stats);
        };

        finalize();
        return;
      }

      setCurrentStep(stepIndex);
      const stepDuration = scanSteps[stepIndex].duration;
      const stepProgress = ((stepIndex + 1) / scanSteps.length) * 100;

      // Animate progress
      const startProgress = (stepIndex / scanSteps.length) * 100;
      const progressStep = (stepProgress - startProgress) / (stepDuration / 50);
      let currentProgress = startProgress;

      progressInterval = setInterval(() => {
        currentProgress += progressStep;
        if (currentProgress >= stepProgress) {
          currentProgress = stepProgress;
          clearInterval(progressInterval);
        }
        setProgress(currentProgress);
      }, 50);

      // Cycle through scanning links
      if (stepIndex === 1) {
        const linkInterval = setInterval(() => {
          setScanningLink((prev) => (prev + 1) % enabledLinks.length);
        }, 500);
        stepTimeout = setTimeout(() => {
          clearInterval(linkInterval);
          runStep(stepIndex + 1);
        }, stepDuration);
      } else {
        stepTimeout = setTimeout(() => {
          runStep(stepIndex + 1);
        }, stepDuration);
      }
    };

    runStep(0);

    return () => {
      clearTimeout(stepTimeout);
      clearInterval(progressInterval);
      if (pollRef.current) {
        clearInterval(pollRef.current);
        pollRef.current = null;
      }
      if (timeoutRef.current) {
        clearTimeout(timeoutRef.current);
        timeoutRef.current = null;
      }
      if (abortRef.current) {
        abortRef.current.abort();
        abortRef.current = null;
      }
    };
  }, [isScanning, onComplete, onError, scanToken]);

  if (!isScanning) return null;

  const CurrentIcon = scanSteps[currentStep]?.icon || Shield;
  const enabledCount = enabledLinks.length;

  const handleStopScan = () => {
    canceledRef.current = true;
    if (abortRef.current) {
      abortRef.current.abort();
      abortRef.current = null;
    }
    if (timeoutRef.current) {
      clearTimeout(timeoutRef.current);
      timeoutRef.current = null;
    }
    onCancel?.();
  };

  return (
    <motion.div
      initial={{ opacity: 0, y: 20 }}
      animate={{ opacity: 1, y: 0 }}
      className="bg-card rounded-2xl border border-border p-8 shadow-lg"
    >
      <div className="text-center mb-8">
        <motion.div
          animate={{ rotate: 360 }}
          transition={{ duration: 2, repeat: Infinity, ease: 'linear' }}
          className="w-20 h-20 rounded-full bg-cyber/10 flex items-center justify-center mx-auto mb-4 cyber-glow"
        >
          <CurrentIcon className="w-10 h-10 text-cyber" />
        </motion.div>
        <h2 className="text-2xl font-bold text-foreground mb-2">Scanning Dark Web...</h2>
        <p className="text-muted-foreground">
          {(scanSteps[currentStep]?.label || 'Processing...')}
        </p>
        <p className="text-xs text-muted-foreground mt-2">
          Enabled sources: {enabledCount}
        </p>
      </div>

      {warning && (
        <div className="mb-6 p-4 rounded-xl border border-yellow-500/30 bg-yellow-500/10 text-yellow-700 text-sm">
          {warning}
        </div>
      )}

      {/* Progress Bar */}
      <div className="mb-8">
        <div className="flex justify-between text-sm text-muted-foreground mb-2">
          <span>Progress</span>
          <span>{Math.round(progress)}%</span>
        </div>
        <div className="h-3 bg-muted rounded-full overflow-hidden">
          <motion.div
            className="h-full bg-cyber rounded-full"
            initial={{ width: 0 }}
            animate={{ width: `${progress}%` }}
            transition={{ duration: 0.3 }}
          />
        </div>
      </div>

      {/* Steps */}
      <div className="space-y-3 mb-8">
        {scanSteps.map((step, index) => {
          const Icon = step.icon;
          const isComplete = index < currentStep;
          const isCurrent = index === currentStep;

          return (
            <motion.div
              key={index}
              initial={{ opacity: 0, x: -20 }}
              animate={{ opacity: 1, x: 0 }}
              transition={{ delay: index * 0.1 }}
              className={`flex items-center gap-3 p-3 rounded-lg transition-colors ${
                isCurrent
                  ? 'bg-cyber/10 border border-cyber/30'
                  : isComplete
                  ? 'bg-safe/5'
                  : 'bg-muted/50'
              }`}
            >
              <div
                className={`w-8 h-8 rounded-full flex items-center justify-center ${
                  isCurrent
                    ? 'bg-cyber text-primary'
                    : isComplete
                    ? 'bg-safe text-safe-foreground'
                    : 'bg-muted text-muted-foreground'
                }`}
              >
                {isComplete ? (
                  <Check className="w-4 h-4" />
                ) : (
                  <Icon className={`w-4 h-4 ${isCurrent ? 'animate-pulse' : ''}`} />
                )}
              </div>
              <span
                className={`text-sm font-medium ${
                  isCurrent
                    ? 'text-foreground'
                    : isComplete
                    ? 'text-safe'
                    : 'text-muted-foreground'
                }`}
              >
                {index === 1 ? `${step.label} (${enabledCount})` : step.label}
              </span>
            </motion.div>
          );
        })}
      </div>

      <div className="flex justify-center mb-6">
        <button
          type="button"
          onClick={handleStopScan}
          className="px-4 py-2 text-sm rounded-lg border border-border text-foreground hover:bg-muted"
        >
          Stop Scan
        </button>
      </div>

      {/* Currently Scanning */}
      {currentStep === 1 && enabledLinks.length > 0 && (
        <motion.div
          initial={{ opacity: 0 }}
          animate={{ opacity: 1 }}
          className="p-4 bg-muted rounded-lg"
        >
          <p className="text-sm text-muted-foreground mb-3">Scanning sources:</p>
          <div className="flex flex-wrap gap-2">
            {enabledLinks.map((link, index) => (
              <motion.span
                key={link.id}
                animate={{
                  scale: index === scanningLink ? 1.05 : 1,
                  opacity: index === scanningLink ? 1 : 0.5,
                }}
                className={`px-3 py-1.5 rounded-full text-xs font-medium ${
                  index === scanningLink
                    ? 'bg-cyber text-primary'
                    : 'bg-secondary text-secondary-foreground'
                }`}
              >
                Source {index + 1}
              </motion.span>
            ))}
          </div>
        </motion.div>
      )}
    </motion.div>
  );
}
