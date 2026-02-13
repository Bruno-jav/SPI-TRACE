import { useState } from 'react';
import { motion } from 'framer-motion';
import { useAuth } from '@/contexts/AuthContext';
import { ClientLayout } from '@/components/layouts/ClientLayout';
import { PageTransition, fadeInUp, staggerContainer } from '@/components/animations/PageTransition';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from '@/components/ui/card';
import { useToast } from '@/components/ui/use-toast';
import {
  Settings as SettingsIcon,
  User,
  Globe,
  Bell,
  Save,
} from 'lucide-react';

export default function Settings() {
  const { user } = useAuth();
  const { toast } = useToast();

  const [username, setUsername] = useState(user?.email.split('@')[0] || '');
  const [language, setLanguage] = useState('english');
  const [alertMode, setAlertMode] = useState('email');
  const [isSaving, setIsSaving] = useState(false);

  const handleSaveSettings = async () => {
    setIsSaving(true);
    try {
      // Simulate API call
      setTimeout(() => {
        toast({
          title: 'Success!',
          description: 'Your settings have been saved successfully.',
        });
        setIsSaving(false);
      }, 500);
    } catch (error) {
      toast({
        title: 'Error',
        description: 'Failed to save settings. Please try again.',
        variant: 'destructive',
      });
      setIsSaving(false);
    }
  };

  return (
    <ClientLayout>
      <PageTransition>
        <div className="container mx-auto px-4 py-8">
          <motion.div
            variants={staggerContainer}
            initial="initial"
            animate="animate"
            className="max-w-2xl mx-auto space-y-8"
          >
            {/* Header */}
            <motion.div variants={fadeInUp}>
              <div className="flex items-center gap-3 mb-2">
                <SettingsIcon className="w-8 h-8 text-cyber" />
                <h1 className="text-3xl font-bold text-foreground">Settings</h1>
              </div>
              <p className="text-muted-foreground">
                Manage your account preferences and notification settings
              </p>
            </motion.div>

            {/* Username Card */}
            <motion.div variants={fadeInUp}>
              <Card className="border-border">
                <CardHeader>
                  <div className="flex items-center gap-2">
                    <User className="w-5 h-5 text-cyber" />
                    <CardTitle>Change Username</CardTitle>
                  </div>
                  <CardDescription>Update your display name</CardDescription>
                </CardHeader>
                <CardContent className="space-y-4">
                  <div className="space-y-2">
                    <Label htmlFor="username">Username</Label>
                    <Input
                      id="username"
                      value={username}
                      onChange={(e) => setUsername(e.target.value)}
                      placeholder="Enter your username"
                      className="bg-background"
                    />
                    <p className="text-xs text-muted-foreground">
                      Your username must be between 3 and 20 characters
                    </p>
                  </div>
                </CardContent>
              </Card>
            </motion.div>

            {/* Language Card */}
            <motion.div variants={fadeInUp}>
              <Card className="border-border">
                <CardHeader>
                  <div className="flex items-center gap-2">
                    <Globe className="w-5 h-5 text-cyber" />
                    <CardTitle>Language</CardTitle>
                  </div>
                  <CardDescription>Choose your preferred language</CardDescription>
                </CardHeader>
                <CardContent className="space-y-4">
                  <div className="space-y-2">
                    <Label htmlFor="language">Select Language</Label>
                    <Select value={language} onValueChange={setLanguage}>
                      <SelectTrigger id="language" className="bg-background">
                        <SelectValue placeholder="Choose a language" />
                      </SelectTrigger>
                      <SelectContent>
                        <SelectItem value="english">English</SelectItem>
                        <SelectItem value="spanish">Spanish</SelectItem>
                        <SelectItem value="french">French</SelectItem>
                        <SelectItem value="german">German</SelectItem>
                        <SelectItem value="chinese">Chinese Simplified</SelectItem>
                        <SelectItem value="japanese">Japanese</SelectItem>
                        <SelectItem value="hindi">Hindi</SelectItem>
                        <SelectItem value="portuguese">Portuguese</SelectItem>
                      </SelectContent>
                    </Select>
                  </div>
                </CardContent>
              </Card>
            </motion.div>

            {/* Alert Mode Card */}
            <motion.div variants={fadeInUp}>
              <Card className="border-border">
                <CardHeader>
                  <div className="flex items-center gap-2">
                    <Bell className="w-5 h-5 text-cyber" />
                    <CardTitle>Alert Mode</CardTitle>
                  </div>
                  <CardDescription>Choose how you want to receive breach alerts</CardDescription>
                </CardHeader>
                <CardContent className="space-y-4">
                  <div className="space-y-2">
                    <Label htmlFor="alert-mode">Notification Method</Label>
                    <Select value={alertMode} onValueChange={setAlertMode}>
                      <SelectTrigger id="alert-mode" className="bg-background">
                        <SelectValue placeholder="Choose alert method" />
                      </SelectTrigger>
                      <SelectContent>
                        <SelectItem value="email">
                          <span className="flex items-center gap-2">
                            Email - Receive alerts to {user?.email}
                          </span>
                        </SelectItem>
                        <SelectItem value="sms">
                          <span>SMS - Receive alerts via text message</span>
                        </SelectItem>
                      </SelectContent>
                    </Select>
                    <p className="text-xs text-muted-foreground">
                      {alertMode === 'email'
                        ? 'You will receive breach notifications to your registered email address.'
                        : 'You will receive breach notifications via SMS. Please ensure your phone number is verified.'}
                    </p>
                  </div>
                </CardContent>
              </Card>
            </motion.div>

            {/* Save Button */}
            <motion.div variants={fadeInUp} className="flex justify-end">
              <Button
                onClick={handleSaveSettings}
                disabled={isSaving}
                size="lg"
                className="gap-2"
                variant="hero"
              >
                <Save className="w-4 h-4" />
                {isSaving ? 'Saving...' : 'Save Settings'}
              </Button>
            </motion.div>
          </motion.div>
        </div>
      </PageTransition>
    </ClientLayout>
  );
}
