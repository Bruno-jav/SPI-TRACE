import { useEffect, useState, type ComponentType } from 'react';
import { motion } from 'framer-motion';
import { useScan, ScanSettings, ScanSettingsRange, ScanModel } from '@/contexts/ScanContext';
import { AdminLayout } from '@/components/layouts/AdminLayout';
import { PageTransition, fadeInUp, staggerContainer } from '@/components/animations/PageTransition';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Switch } from '@/components/ui/switch';
import { toast } from 'sonner';
import { Gauge, Layers, Timer, Globe, Save, RotateCcw, Sliders, Zap } from 'lucide-react';

type RangeKey = keyof Pick<
  ScanSettings,
  | 'pages'
  | 'depth'
  | 'time_limit_seconds'
  | 'min_priority_to_expand'
  | 'requests_per_minute'
  | 'request_timeout_seconds'
>;

type RangeField = keyof ScanSettingsRange;

const cloneRange = (range: ScanSettingsRange): ScanSettingsRange => ({
  min: range.min,
  max: range.max,
  default: range.default,
});

const cloneSettings = (settings: ScanSettings): ScanSettings => ({
  pages: cloneRange(settings.pages),
  depth: cloneRange(settings.depth),
  time_limit_seconds: cloneRange(settings.time_limit_seconds),
  min_priority_to_expand: cloneRange(settings.min_priority_to_expand),
  include_subdomains: settings.include_subdomains,
  requests_per_minute: cloneRange(settings.requests_per_minute),
  request_timeout_seconds: cloneRange(settings.request_timeout_seconds),
  models: settings.models ? {
    efficiency: { ...settings.models.efficiency },
    balanced: { ...settings.models.balanced },
    accuracy: { ...settings.models.accuracy },
  } : undefined,
});

const toNumber = (value: string, fallback: number) => {
  const parsed = Number(value);
  return Number.isFinite(parsed) ? parsed : fallback;
};

const clampDefault = (range: ScanSettingsRange, value: number): ScanSettingsRange => {
  const next = { ...range };
  next.default = Math.min(next.max, Math.max(next.min, value));
  return next;
};

export default function AdminScanSettings() {
  const { scanSettings, refreshScanSettings, updateScanSettings } = useScan();
  const [draft, setDraft] = useState<ScanSettings | null>(null);
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    if (!scanSettings) {
      refreshScanSettings().catch((error) => {
        console.error(error);
        toast.error('Failed to load scan settings');
      });
      return;
    }
    const cloned = cloneSettings(scanSettings);
    // Ensure models are always initialized
    if (!cloned.models) {
      cloned.models = {
        efficiency: {
          pages: 1,
          depth: 0,
          time_limit_seconds: 5,
          min_priority_to_expand: 6,
          requests_per_minute: 50,
          request_timeout_seconds: 3,
        },
        balanced: {
          pages: 2,
          depth: 1,
          time_limit_seconds: 15,
          min_priority_to_expand: 3,
          requests_per_minute: 20,
          request_timeout_seconds: 8,
        },
        accuracy: {
          pages: 4,
          depth: 2,
          time_limit_seconds: 50,
          min_priority_to_expand: 0,
          requests_per_minute: 5,
          request_timeout_seconds: 45,
        },
      };
    }
    setDraft(cloned);
  }, [scanSettings, refreshScanSettings]);

  const updateRange = (key: RangeKey, field: RangeField, value: number) => {
    setDraft((prev) => {
      if (!prev) return prev;
      const nextRange = { ...prev[key], [field]: value } as ScanSettingsRange;
      if (nextRange.min > nextRange.max) {
        if (field === 'min') {
          nextRange.max = nextRange.min;
        } else if (field === 'max') {
          nextRange.min = nextRange.max;
        }
      }
      nextRange.default = Math.min(nextRange.max, Math.max(nextRange.min, nextRange.default));
      return { ...prev, [key]: nextRange } as ScanSettings;
    });
  };

  const updateRangeWithLimits = (
    range: ScanSettingsRange,
    min: number,
    max: number,
    defaultVal: number
  ): ScanSettingsRange => ({
    min,
    max,
    default: Math.min(max, Math.max(min, defaultVal)),
  });

  const applyPreset = (preset: 'efficiency' | 'balanced' | 'accuracy') => {
    setDraft((prev) => {
      if (!prev) return prev;
      
      const modelPresets = {
        efficiency: {
          pages: 1,
          depth: 0,
          time_limit_seconds: 5,
          min_priority_to_expand: 6,
          requests_per_minute: 50,
          request_timeout_seconds: 3,
        },
        balanced: {
          pages: 2,
          depth: 1,
          time_limit_seconds: 15,
          min_priority_to_expand: 3,
          requests_per_minute: 20,
          request_timeout_seconds: 8,
        },
        accuracy: {
          pages: 4,
          depth: 2,
          time_limit_seconds: 50,
          min_priority_to_expand: 0,
          requests_per_minute: 5,
          request_timeout_seconds: 45,
        },
      };

      // Define range limits for each preset
      const rangeLimits = {
        efficiency: {
          pages: { min: 1, max: 2 },
          depth: { min: 0, max: 1 },
          time_limit_seconds: { min: 5, max: 15 },
          min_priority_to_expand: { min: 0, max: 6 },
          requests_per_minute: { min: 20, max: 60 },
          request_timeout_seconds: { min: 3, max: 10 },
        },
        balanced: {
          pages: { min: 1, max: 4 },
          depth: { min: 0, max: 2 },
          time_limit_seconds: { min: 5, max: 60 },
          min_priority_to_expand: { min: 0, max: 6 },
          requests_per_minute: { min: 5, max: 100 },
          request_timeout_seconds: { min: 3, max: 30 },
        },
        accuracy: {
          pages: { min: 1, max: 8 },
          depth: { min: 0, max: 3 },
          time_limit_seconds: { min: 5, max: 120 },
          min_priority_to_expand: { min: 0, max: 6 },
          requests_per_minute: { min: 1, max: 100 },
          request_timeout_seconds: { min: 3, max: 60 },
        },
      };

      const newSettings = { ...prev };
      const presetValues = modelPresets[preset];
      const limits = rangeLimits[preset];
      
      // Update models
      if (!newSettings.models) {
        newSettings.models = {
          efficiency: { ...modelPresets.efficiency },
          balanced: { ...modelPresets.balanced },
          accuracy: { ...modelPresets.accuracy },
        };
      } else {
        newSettings.models[preset] = { ...modelPresets[preset] };
      }
      
      // Update range values AND min/max limits
      newSettings.pages = updateRangeWithLimits(
        newSettings.pages,
        limits.pages.min,
        limits.pages.max,
        presetValues.pages
      );
      newSettings.depth = updateRangeWithLimits(
        newSettings.depth,
        limits.depth.min,
        limits.depth.max,
        presetValues.depth
      );
      newSettings.time_limit_seconds = updateRangeWithLimits(
        newSettings.time_limit_seconds,
        limits.time_limit_seconds.min,
        limits.time_limit_seconds.max,
        presetValues.time_limit_seconds
      );
      newSettings.min_priority_to_expand = updateRangeWithLimits(
        newSettings.min_priority_to_expand,
        limits.min_priority_to_expand.min,
        limits.min_priority_to_expand.max,
        presetValues.min_priority_to_expand
      );
      newSettings.requests_per_minute = updateRangeWithLimits(
        newSettings.requests_per_minute,
        limits.requests_per_minute.min,
        limits.requests_per_minute.max,
        presetValues.requests_per_minute
      );
      newSettings.request_timeout_seconds = updateRangeWithLimits(
        newSettings.request_timeout_seconds,
        limits.request_timeout_seconds.min,
        limits.request_timeout_seconds.max,
        presetValues.request_timeout_seconds
      );
      
      return newSettings;
    });
  };

  const handleSave = async () => {
    if (!draft) return;
    try {
      setSaving(true);
      await updateScanSettings(draft);
      toast.success('Scan settings updated');
    } catch (error) {
      console.error(error);
      toast.error('Failed to update scan settings');
    } finally {
      setSaving(false);
    }
  };

  const handleReset = () => {
    if (!scanSettings) return;
    setDraft(cloneSettings(scanSettings));
    toast.info('Reverted to last saved settings');
  };

  if (!draft) {
    return (
      <AdminLayout>
        <PageTransition>
          <div className="p-6 text-muted-foreground">Loading scan settings...</div>
        </PageTransition>
      </AdminLayout>
    );
  }

  const RangeRow = ({
    label,
    description,
    icon: Icon,
    rangeKey,
    step,
  }: {
    label: string;
    description: string;
    icon: ComponentType<{ className?: string }>;
    rangeKey: RangeKey;
    step?: number;
  }) => (
    <div className="grid grid-cols-1 lg:grid-cols-12 gap-4 items-end">
      <div className="lg:col-span-4 space-y-1">
        <div className="flex items-center gap-2">
          <Icon className="w-4 h-4 text-cyber" />
          <Label className="text-sm font-semibold">{label}</Label>
        </div>
        <p className="text-xs text-muted-foreground">{description}</p>
      </div>
      <div className="lg:col-span-8 grid grid-cols-3 gap-3">
        <div className="space-y-2">
          <Label className="text-xs text-muted-foreground">Min</Label>
          <Input
            type="number"
            step={step}
            value={draft[rangeKey].min}
            onChange={(event) =>
              updateRange(
                rangeKey,
                'min',
                toNumber(event.target.value, draft[rangeKey].min)
              )
            }
          />
        </div>
        <div className="space-y-2">
          <Label className="text-xs text-muted-foreground">Default</Label>
          <Input
            type="number"
            step={step}
            value={draft[rangeKey].default}
            onChange={(event) =>
              updateRange(
                rangeKey,
                'default',
                toNumber(event.target.value, draft[rangeKey].default)
              )
            }
          />
        </div>
        <div className="space-y-2">
          <Label className="text-xs text-muted-foreground">Max</Label>
          <Input
            type="number"
            step={step}
            value={draft[rangeKey].max}
            onChange={(event) =>
              updateRange(
                rangeKey,
                'max',
                toNumber(event.target.value, draft[rangeKey].max)
              )
            }
          />
        </div>
      </div>
    </div>
  );

  return (
    <AdminLayout>
      <PageTransition>
        <motion.div
          variants={staggerContainer}
          initial="initial"
          animate="animate"
          className="space-y-8"
        >
          <motion.div variants={fadeInUp} className="flex flex-col gap-2">
            <h1 className="text-3xl font-bold text-foreground">Scan Settings</h1>
            <p className="text-muted-foreground">
              Control scan depth, pages, and timeouts to balance speed vs accuracy.
            </p>
          </motion.div>

          <motion.div variants={fadeInUp} className="bg-card border border-border rounded-xl p-6">
            <div className="flex flex-col lg:flex-row lg:items-center lg:justify-between gap-4">
              <div>
                <div className="flex items-center gap-2">
                  <Sliders className="w-5 h-5 text-cyber" />
                  <h2 className="text-lg font-semibold text-foreground">Scan Focus</h2>
                </div>
                <p className="text-sm text-muted-foreground">
                  Choose a preset, then fine-tune ranges below.
                </p>
              </div>
              <div className="flex flex-wrap gap-2">
                <Button variant="outline" onClick={() => applyPreset('efficiency')}>
                  Efficiency
                </Button>
                <Button variant="outline" onClick={() => applyPreset('balanced')}>
                  Balanced
                </Button>
                <Button variant="outline" onClick={() => applyPreset('accuracy')}>
                  Accuracy
                </Button>
              </div>
            </div>
          </motion.div>

          <motion.div variants={fadeInUp}>
            <Card>
              <CardHeader>
                <CardTitle className="flex items-center gap-2">
                  <Gauge className="w-5 h-5" />
                  Scan Limits
                </CardTitle>
                <CardDescription>
                  Lower limits finish faster. Higher limits explore more pages.
                </CardDescription>
              </CardHeader>
              <CardContent className="space-y-6">
                <RangeRow
                  label="Max Pages"
                  description="Total pages to scan per site"
                  icon={Gauge}
                  rangeKey="pages"
                  step={1}
                />
                <RangeRow
                  label="Max Depth"
                  description="How deep the crawler should traverse"
                  icon={Layers}
                  rangeKey="depth"
                  step={1}
                />
                <RangeRow
                  label="Time Limit (seconds)"
                  description="Hard cap per site scan"
                  icon={Timer}
                  rangeKey="time_limit_seconds"
                  step={1}
                />
              </CardContent>
            </Card>
          </motion.div>

          <motion.div variants={fadeInUp}>
            <Card>
              <CardHeader>
                <CardTitle className="flex items-center gap-2">
                  <Layers className="w-5 h-5" />
                  Crawl Behavior
                </CardTitle>
                <CardDescription>
                  Tune link prioritization and scope.
                </CardDescription>
              </CardHeader>
              <CardContent className="space-y-6">
                <RangeRow
                  label="Min Priority"
                  description="Links below this score are skipped"
                  icon={Layers}
                  rangeKey="min_priority_to_expand"
                  step={1}
                />
                <div className="flex items-center justify-between">
                  <div className="space-y-1">
                    <div className="flex items-center gap-2">
                      <Globe className="w-4 h-4 text-cyber" />
                      <Label className="text-sm font-semibold">Include Subdomains</Label>
                    </div>
                    <p className="text-xs text-muted-foreground">
                      Expand crawl to subdomains of the target site.
                    </p>
                  </div>
                  <Switch
                    checked={draft.include_subdomains}
                    onCheckedChange={(value) =>
                      setDraft((prev) => (prev ? { ...prev, include_subdomains: value } : prev))
                    }
                  />
                </div>
              </CardContent>
            </Card>
          </motion.div>

          <motion.div variants={fadeInUp}>
            <Card>
              <CardHeader>
                <CardTitle className="flex items-center gap-2">
                  <Timer className="w-5 h-5" />
                  Request Pacing
                </CardTitle>
                <CardDescription>
                  Balance speed with politeness to target servers.
                </CardDescription>
              </CardHeader>
              <CardContent className="space-y-6">
                <RangeRow
                  label="Requests Per Minute"
                  description="Rate limit for each crawler"
                  icon={Gauge}
                  rangeKey="requests_per_minute"
                  step={0.5}
                />
                <RangeRow
                  label="Request Timeout (seconds)"
                  description="Per-request timeout before skipping"
                  icon={Timer}
                  rangeKey="request_timeout_seconds"
                  step={1}
                />
              </CardContent>
            </Card>
          </motion.div>

          <motion.div variants={fadeInUp}>
            <Card>
              <CardHeader>
                <CardTitle className="flex items-center gap-2">
                  <Zap className="w-5 h-5" />
                  Scan Models
                </CardTitle>
                <CardDescription>
                  Configure the parameters for each scan characteristic model.
                </CardDescription>
              </CardHeader>
              <CardContent className="space-y-6">
                {draft.models ? (
                  Object.entries(draft.models).map(([modelName, modelValue]) => (
                    <div key={modelName} className="border border-border rounded-lg p-4 space-y-4">
                      <h3 className="font-semibold text-foreground capitalize">{modelName} Model</h3>
                      <div className="grid grid-cols-2 lg:grid-cols-3 gap-4">
                        {Object.entries(modelValue).map(([key, value]) => (
                          <div key={key} className="space-y-1">
                            <Label className="text-xs text-muted-foreground capitalize">
                              {key.replace(/_/g, ' ')}
                            </Label>
                            <Input
                              type="number"
                              step={key.includes('seconds') || key.includes('minute') ? 0.5 : 1}
                              value={value}
                              onChange={(e) =>
                                setDraft((prev) => {
                                  if (!prev || !prev.models) return prev;
                                  return {
                                    ...prev,
                                    models: {
                                      ...prev.models,
                                      [modelName]: {
                                        ...prev.models[modelName as keyof typeof prev.models],
                                        [key]: Number(e.target.value),
                                      },
                                    },
                                  };
                                })
                              }
                            />
                          </div>
                        ))}
                      </div>
                    </div>
                  ))
                ) : (
                  <p className="text-sm text-muted-foreground">No scan models configured</p>
                )}
              </CardContent>
            </Card>
          </motion.div>

          <motion.div variants={fadeInUp} className="flex flex-wrap gap-3">
            <Button onClick={handleSave} disabled={saving} className="bg-cyber hover:bg-cyber/90">
              <Save className="w-4 h-4 mr-2" />
              {saving ? 'Saving...' : 'Save Settings'}
            </Button>
            <Button variant="outline" onClick={handleReset} disabled={saving}>
              <RotateCcw className="w-4 h-4 mr-2" />
              Reset
            </Button>
          </motion.div>
        </motion.div>
      </PageTransition>
    </AdminLayout>
  );
}
