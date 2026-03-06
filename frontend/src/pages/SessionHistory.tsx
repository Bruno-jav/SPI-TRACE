import { PageTransition } from '@/components/animations/PageTransition';

export default function SessionHistory() {
  return (
    <PageTransition>
      <section className="py-20 bg-background">
        <div className="container mx-auto px-4">
          <div className="max-w-3xl mx-auto text-center">
            <h1 className="text-2xl font-bold text-foreground mb-4">Session History</h1>
            <p className="text-muted-foreground">A record of your active sessions, login times, and device info will appear here.</p>
          </div>
        </div>
      </section>
    </PageTransition>
  );
}
