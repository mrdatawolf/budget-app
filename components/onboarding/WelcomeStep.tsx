'use client';

interface WelcomeStepProps {
  onNext: () => void;
  onLoadDemo: () => void;
  demoLoading: boolean;
}

export default function WelcomeStep({ onNext, onLoadDemo, demoLoading }: WelcomeStepProps) {
  return (
    <div className="text-center max-w-lg mx-auto">
      <div className="text-6xl mb-6">👋</div>
      <h1 className="text-3xl font-bold text-text-primary mb-4">
        Welcome to Budget App!
      </h1>
      <p className="text-lg text-text-secondary mb-2">
        Take control of your money with zero-based budgeting.
      </p>
      <p className="text-text-tertiary mb-10">
        We&apos;ll walk you through setting up your first budget in just a few steps.
      </p>
      <button
        onClick={onNext}
        disabled={demoLoading}
        className="bg-primary text-white px-10 py-3 rounded-lg text-lg font-semibold hover:bg-primary-hover transition-colors disabled:opacity-50"
      >
        Get Started
      </button>

      <div className="flex items-center gap-3 my-6">
        <div className="flex-1 h-px bg-border" />
        <span className="text-text-tertiary text-sm">or</span>
        <div className="flex-1 h-px bg-border" />
      </div>

      <button
        onClick={onLoadDemo}
        disabled={demoLoading}
        className="border border-border-strong text-text-secondary px-8 py-3 rounded-lg text-sm font-medium hover:bg-surface-secondary transition-colors disabled:opacity-50"
      >
        {demoLoading ? 'Loading demo data...' : 'Try with Demo Data'}
      </button>
      <p className="text-text-tertiary text-xs mt-3">
        Instantly load a sample budget with realistic transactions to explore the app.
      </p>
    </div>
  );
}
