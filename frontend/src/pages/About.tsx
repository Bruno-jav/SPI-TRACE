import { Link } from 'react-router-dom';
import { PageTransition, fadeInUp } from '@/components/animations/PageTransition';
import { Shield } from 'lucide-react';

export default function About() {
  return (
    <PageTransition>
      <section className="py-20 bg-background">
        <div className="container mx-auto px-4">
          <div className="max-w-3xl mx-auto text-center">
            <Shield className="w-16 h-16 text-cyber mx-auto mb-6" />
            <h1 className="text-3xl font-bold text-foreground mb-4">About SPI-TRACE</h1>
            <p className="text-muted-foreground mb-6">
              SPI-TRACE scans public and private dark web sources — marketplaces, forums, paste sites, and other leak repositories — to help you discover if your personal information has been exposed. We aggregate intelligence from a wide variety of sources and provide alerts and remediation guidance.
            </p>

            <h2 className="text-xl font-semibold text-foreground mt-6 mb-2">Where we look</h2>
            <ul className="text-muted-foreground list-disc list-inside space-y-2">
              <li>Dark web marketplaces and forums</li>
              <li>Paste sites and code repositories</li>
              <li>Leak collections and searchable breach archives</li>
              <li>Open-source intelligence sources</li>
            </ul>

            <p className="text-sm text-muted-foreground mt-6">
              <Link to="/" className="text-cyber hover:underline">Back to home</Link>
            </p>
          </div>
        </div>
      </section>
    </PageTransition>
  );
}
