import { ReactNode } from 'react';
import { Link, useLocation } from 'react-router-dom';
import { motion, AnimatePresence } from 'framer-motion';
import { useAuth } from '@/contexts/AuthContext';
import { Button } from '@/components/ui/button';
import { ThemeToggle } from '@/components/ThemeToggle';
import {
  Shield,
  Home,
  History,
  LogOut,
  Menu,
  X,
  User,
  Settings,
} from 'lucide-react';
import { useState } from 'react';

interface ClientLayoutProps {
  children: ReactNode;
}

const navItems = [
  { path: '/dashboard', label: 'Home', icon: Home },
];

export function ClientLayout({ children }: ClientLayoutProps) {
  const { user, signOut } = useAuth();
  const location = useLocation();
  const [mobileMenuOpen, setMobileMenuOpen] = useState(false);

  return (
    <div className="min-h-screen bg-background">
      {/* Header */}
      <header className="sticky top-0 z-50 border-b border-border bg-card/80 backdrop-blur-md">
        <div className="container mx-auto px-4">
          <div className="flex h-16 items-center justify-between gap-4">
            {/* Logo */}
            <Link to="/" className="flex items-center gap-2 group flex-shrink-0">
              <motion.div
                whileHover={{ rotate: 10 }}
                transition={{ type: 'spring', stiffness: 400 }}
              >
                <div className="w-8 h-8 bg-gradient-to-br from-cyber to-cyber/50 rounded-md flex items-center justify-center font-bold text-white text-xs">SPI</div>
              </motion.div>
              <span className="text-xl font-bold text-foreground">
                SPI-<span className="text-cyber">TRACE</span>
              </span>
            </Link>

            {/* Desktop Navigation - Centered */}
            <nav className="hidden md:flex items-center gap-8 justify-center flex-1">
              {navItems
                .filter((item) => {
                  // hide the Home nav item while on the dashboard page
                  if (item.path === '/dashboard' && location.pathname === '/dashboard') return false;
                  return true;
                })
                .map((item) => {
                  const isActive = location.pathname === item.path;
                  const Icon = item.icon;
                  return (
                    <Link key={item.path} to={item.path}>
                      <motion.div
                        className={`flex items-center gap-2 px-5 py-2.5 rounded-lg transition-colors ${
                          isActive
                            ? 'bg-cyber/10 text-cyber'
                            : 'text-muted-foreground hover:text-foreground hover:bg-muted'
                        }`}
                        whileHover={{ scale: 1.02 }}
                        whileTap={{ scale: 0.98 }}
                      >
                        <Icon className="w-5 h-5" />
                        <span className="font-medium text-base">{item.label}</span>
                      </motion.div>
                    </Link>
                  );
                })}
              <Link to="/history">
                <Button variant="ghost" size="lg" className="flex items-center gap-2 px-5 py-2.5">
                  <History className="w-5 h-5" />
                  <span className="text-base">History</span>
                </Button>
              </Link>
              <Link to="/settings">
                <Button variant="ghost" size="lg" className="flex items-center gap-2 px-5 py-2.5">
                  <Settings className="w-5 h-5" />
                  <span className="text-base">Settings</span>
                </Button>
              </Link>
            </nav>

            {/* User Menu - Right */}
            <div className="hidden md:flex items-center gap-2 flex-shrink-0">
              <ThemeToggle />
              {user && (
                <div className="flex items-center gap-2 px-3 py-1.5 rounded-lg bg-muted cursor-pointer" title={user.email}>
                  <User className="w-4 h-4 text-muted-foreground" />
                </div>
              )}
              <Button variant="ghost" size="sm" onClick={signOut}>
                <LogOut className="w-4 h-4" />
                Sign Out
              </Button>
            </div>

            {/* Mobile Menu Button */}
            <button
              className="md:hidden p-2 rounded-lg hover:bg-muted"
              onClick={() => setMobileMenuOpen(!mobileMenuOpen)}
            >
              {mobileMenuOpen ? (
                <X className="w-6 h-6" />
              ) : (
                <Menu className="w-6 h-6" />
              )}
            </button>
          </div>
        </div>

        {/* Mobile Menu */}
        <AnimatePresence>
          {mobileMenuOpen && (
            <motion.div
              initial={{ opacity: 0, height: 0 }}
              animate={{ opacity: 1, height: 'auto' }}
              exit={{ opacity: 0, height: 0 }}
              className="md:hidden border-t border-border bg-card"
            >
              <div className="container mx-auto px-4 py-4 space-y-2">
                {navItems
                  .filter((item) => {
                    // hide the Home nav item while on the authenticated home page
                    if (item.path === '/' && location.pathname === '/home') return false;
                    return true;
                  })
                  .map((item) => {
                    const isActive = location.pathname === item.path;
                    const Icon = item.icon;
                    return (
                      <Link
                        key={item.path}
                        to={item.path}
                        onClick={() => setMobileMenuOpen(false)}
                      >
                        <div
                          className={`flex items-center gap-3 px-4 py-3 rounded-lg ${
                            isActive
                              ? 'bg-cyber/10 text-cyber'
                              : 'text-muted-foreground hover:bg-muted'
                          }`}
                        >
                          <Icon className="w-5 h-5" />
                          <span className="font-medium">{item.label}</span>
                        </div>
                      </Link>
                    );
                  })}
                <div className="flex flex-col gap-2 px-4 py-3">
                  <Link to="/history" onClick={() => setMobileMenuOpen(false)}>
                    <div className="flex items-center gap-3 text-muted-foreground hover:bg-muted px-4 py-3 rounded-lg">
                      <History className="w-5 h-5" />
                      <span className="font-medium">History</span>
                    </div>
                  </Link>
                  <Link to="/settings" onClick={() => setMobileMenuOpen(false)}>
                    <div className="flex items-center gap-3 text-muted-foreground hover:bg-muted px-4 py-3 rounded-lg">
                      <Settings className="w-5 h-5" />
                      <span className="font-medium">Settings</span>
                    </div>
                  </Link>
                </div>
                <div className="pt-4 border-t border-border">
                  {user && (
                    <div className="flex items-center gap-3 px-4 py-2 mb-2 cursor-pointer" title={user.email}>
                      <User className="w-4 h-4 text-muted-foreground" />
                      <span className="text-xs text-muted-foreground">Profile</span>
                    </div>
                  )}
                  <Button
                    variant="ghost"
                    className="w-full justify-start"
                    onClick={() => {
                      signOut();
                      setMobileMenuOpen(false);
                    }}
                  >
                    <LogOut className="w-4 h-4 mr-2" />
                    Sign Out
                  </Button>
                </div>
              </div>
            </motion.div>
          )}
        </AnimatePresence>
      </header>

      {/* Main Content */}
      <main>{children}</main>

      {/* Footer */}
      <footer className="border-t border-border bg-card py-8 mt-auto">
        <div className="container mx-auto px-4">
          <div className="flex flex-col md:flex-row items-center justify-between gap-4">
            <div className="flex items-center gap-2">
              <div className="w-5 h-5 bg-gradient-to-br from-cyber to-cyber/50 rounded-sm flex items-center justify-center text-white text-xs font-bold">S</div>
              <span className="text-sm text-muted-foreground">
                SPI TRACE 2026
              </span>
            </div>
            <div className="flex items-center gap-6 text-sm text-muted-foreground">
              <a href="#" className="hover:text-foreground transition-colors">
                Privacy Policy
              </a>
              <a href="#" className="hover:text-foreground transition-colors">
                Terms of Service
              </a>
              <a href="#" className="hover:text-foreground transition-colors">
                Contact
              </a>
            </div>
          </div>
        </div>
      </footer>
    </div>
  );
}
