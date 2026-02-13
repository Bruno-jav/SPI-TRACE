import { useState } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import { motion } from 'framer-motion';
import { useAuth } from '@/contexts/AuthContext';
import { useScan } from '@/contexts/ScanContext';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { ThemeToggle } from '@/components/ThemeToggle';
import { PageTransition, fadeInUp, staggerContainer } from '@/components/animations/PageTransition';
import { Shield, Mail, Lock, Loader2, ArrowRight, Eye, EyeOff } from 'lucide-react';
import { toast } from 'sonner';

export default function AdminSignIn() {
  const [email, setEmail] = useState('admin@darkwatch.com');
  const [password, setPassword] = useState('');
  const [showPassword, setShowPassword] = useState(false);
  const [isLoading, setIsLoading] = useState(false);
  const [error, setError] = useState('');
  const { signIn } = useAuth();
  const { syncDarkWebLinks } = useScan();
  const navigate = useNavigate();

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setError('');
    setIsLoading(true);

    // Admin validation
    if (!email.endsWith('@darkwatch.com')) {
      setError('Only admin accounts can access this panel');
      setIsLoading(false);
      return;
    }

    const result = await signIn(email, password);

    if (result.success) {
      toast.success('Admin access granted!', {
        description: 'Welcome to the admin panel.',
      });
      try {
        await syncDarkWebLinks();
      } catch (syncError) {
        console.error(syncError);
      }
      navigate('/admin');
    } else {
      setError(result.error || 'Invalid credentials. Please try again.');
      toast.error('Sign in failed', {
        description: result.error || 'Please check your credentials and try again.',
      });
    }

    setIsLoading(false);
  };

  return (
    <div className="min-h-screen flex">
      {/* Theme Toggle */}
      <div className="fixed top-4 right-4 z-50">
        <ThemeToggle />
      </div>

      {/* Back Button */}
      <div className="fixed top-4 left-4 z-50">
        <Link to="/">
          <Button variant="outline" size="sm">
            <ArrowRight className="w-4 h-4 rotate-180" />
          </Button>
        </Link>
      </div>

      {/* Left side - Illustration */}
      <div className="hidden lg:flex flex-1 bg-gradient-to-br from-cyber/20 to-background items-center justify-center p-8 relative overflow-hidden">
        <div className="absolute inset-0 overflow-hidden">
          <div className="absolute top-1/2 left-1/2 -translate-x-1/2 -translate-y-1/2 w-[600px] h-[600px] bg-cyber/10 rounded-full blur-3xl" />
        </div>

        <motion.div
          initial={{ opacity: 0, y: 20 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ delay: 0.2 }}
          className="relative z-10 text-center max-w-md"
        >
          <div className="mb-8">
            <Shield className="w-24 h-24 text-cyber mx-auto" />
          </div>
          <h2 className="text-3xl font-bold mb-4">Admin Control Panel</h2>
          <p className="text-muted-foreground text-lg leading-relaxed">
            Manage dark web links, monitor user scans, and view comprehensive breach reports from a centralized dashboard.
          </p>
        </motion.div>
      </div>

      {/* Right side - Form */}
      <div className="flex-1 flex items-center justify-center p-8 bg-background">
        <PageTransition className="w-full max-w-md">
          <motion.div
            variants={staggerContainer}
            initial="initial"
            animate="animate"
            className="space-y-8"
          >
            {/* Logo */}
            <motion.div variants={fadeInUp} className="text-center">
              <Link to="/" className="inline-flex items-center gap-2 mb-8">
                <div className="w-10 h-10 bg-gradient-to-br from-cyber to-cyber/50 rounded-lg flex items-center justify-center font-bold text-white text-sm">SPI</div>
                <span className="text-2xl font-bold">
                  SPI-<span className="text-cyber">TRACE</span>
                </span>
              </Link>
              <h1 className="text-3xl font-bold text-foreground">Admin Sign In</h1>
              <p className="text-muted-foreground mt-2">
                Access the administrative control panel
              </p>
            </motion.div>

            {/* Form */}
            <motion.form
              variants={fadeInUp}
              onSubmit={handleSubmit}
              className="space-y-6"
            >
              <div className="space-y-4">
                <div className="space-y-2">
                  <Label htmlFor="email">Admin Email</Label>
                  <div className="relative">
                    <Mail className="absolute left-3 top-1/2 -translate-y-1/2 w-5 h-5 text-muted-foreground" />
                    <Input
                      id="email"
                      type="email"
                      placeholder="admin@darkwatch.com"
                      value={email}
                      onChange={(e) => {
                        setEmail(e.target.value);
                        setError('');
                      }}
                      className="pl-11 h-12"
                      required
                    />
                  </div>
                </div>

                <div className="space-y-2">
                  <Label htmlFor="password">Password</Label>
                  <div className="relative">
                    <Lock className="absolute left-3 top-1/2 -translate-y-1/2 w-5 h-5 text-muted-foreground" />
                    <Input
                      id="password"
                      type={showPassword ? 'text' : 'password'}
                      placeholder="••••••••"
                      value={password}
                      onChange={(e) => {
                        setPassword(e.target.value);
                        setError('');
                      }}
                      className="pl-11 pr-11 h-12"
                      required
                    />
                    <button
                      type="button"
                      onClick={() => setShowPassword(!showPassword)}
                      className="absolute right-3 top-1/2 -translate-y-1/2 text-muted-foreground hover:text-foreground"
                    >
                      {showPassword ? (
                        <EyeOff className="w-5 h-5" />
                      ) : (
                        <Eye className="w-5 h-5" />
                      )}
                    </button>
                  </div>
                </div>
              </div>

              {error && (
                <motion.div
                  initial={{ opacity: 0 }}
                  animate={{ opacity: 1 }}
                  className="p-3 rounded-lg bg-breach/10 border border-breach/50 text-sm text-breach"
                >
                  {error}
                </motion.div>
              )}

              <Button
                type="submit"
                variant="hero"
                size="lg"
                className="w-full"
                disabled={isLoading}
              >
                {isLoading ? (
                  <>
                    <Loader2 className="w-5 h-5 animate-spin" />
                    Signing in...
                  </>
                ) : (
                  <>
                    Sign In
                    <ArrowRight className="w-5 h-5" />
                  </>
                )}
              </Button>
            </motion.form>

            {/* Demo credentials */}
            <motion.div
              variants={fadeInUp}
              className="p-4 rounded-lg bg-muted border border-border"
            >
              <p className="text-sm font-medium text-foreground mb-2">Demo Credentials:</p>
              <div className="space-y-1 text-sm text-muted-foreground">
                <p>
                  <span className="font-medium">Admin:</span> admin@darkwatch.com
                </p>
                <p className="text-xs mt-2">(Any password with 6+ characters)</p>
              </div>
            </motion.div>

            {/* Back to home link */}
            <motion.p
              variants={fadeInUp}
              className="text-center text-muted-foreground"
            >
              Not an admin?{' '}
              <Link to="/" className="text-cyber font-medium hover:underline">
                Back to home
              </Link>
            </motion.p>
          </motion.div>
        </PageTransition>
      </div>
    </div>
  );
}
