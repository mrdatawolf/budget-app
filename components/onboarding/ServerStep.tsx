'use client';

import { useState } from 'react';
import { FaServer, FaDesktop, FaGlobe, FaCheck, FaSpinner } from 'react-icons/fa';
import { setServerUrl } from '@/lib/api-client';

interface ServerStepProps {
  onNext: () => void;
}

export default function ServerStep({ onNext }: ServerStepProps) {
  const [mode, setMode] = useState<'local' | 'remote'>('local');
  const [remoteUrl, setRemoteUrl] = useState('');
  const [testing, setTesting] = useState(false);
  const [testResult, setTestResult] = useState<'success' | 'error' | null>(null);

  const handleTestConnection = async () => {
    if (!remoteUrl) return;
    setTesting(true);
    setTestResult(null);

    try {
      const url = remoteUrl.replace(/\/+$/, '');
      const response = await fetch(`${url}/health`, { signal: AbortSignal.timeout(5000) });
      if (response.ok) {
        setTestResult('success');
      } else {
        setTestResult('error');
      }
    } catch {
      setTestResult('error');
    } finally {
      setTesting(false);
    }
  };

  const handleContinue = () => {
    if (mode === 'local') {
      setServerUrl('');
    } else {
      const url = remoteUrl.replace(/\/+$/, '');
      setServerUrl(url);
    }
    onNext();
  };

  const canContinue = mode === 'local' || (mode === 'remote' && remoteUrl.trim().length > 0);

  return (
    <div className="text-center max-w-lg mx-auto">
      <div className="text-6xl mb-6">
        <FaServer className="inline-block text-primary" />
      </div>
      <h1 className="text-3xl font-bold text-text-primary mb-4">
        Server Setup
      </h1>
      <p className="text-lg text-text-secondary mb-2">
        Where is your budget server running?
      </p>
      <p className="text-text-tertiary mb-10">
        If you&apos;re not sure, choose &quot;This machine&quot; — it&apos;s the default for most users.
      </p>

      {/* Mode selection */}
      <div className="flex gap-4 mb-8">
        <button
          onClick={() => { setMode('local'); setTestResult(null); }}
          className={`flex-1 p-5 rounded-lg border-2 transition-all text-left ${
            mode === 'local'
              ? 'border-primary bg-primary-light'
              : 'border-border hover:border-border-strong'
          }`}
        >
          <FaDesktop className={`text-2xl mb-3 ${mode === 'local' ? 'text-primary' : 'text-text-tertiary'}`} />
          <div className="font-semibold text-text-primary">This machine</div>
          <div className="text-sm text-text-secondary mt-1">
            Server runs locally (recommended)
          </div>
        </button>

        <button
          onClick={() => { setMode('remote'); setTestResult(null); }}
          className={`flex-1 p-5 rounded-lg border-2 transition-all text-left ${
            mode === 'remote'
              ? 'border-primary bg-primary-light'
              : 'border-border hover:border-border-strong'
          }`}
        >
          <FaGlobe className={`text-2xl mb-3 ${mode === 'remote' ? 'text-primary' : 'text-text-tertiary'}`} />
          <div className="font-semibold text-text-primary">Remote server</div>
          <div className="text-sm text-text-secondary mt-1">
            Connect to a server on another machine
          </div>
        </button>
      </div>

      {/* Remote URL input */}
      {mode === 'remote' && (
        <div className="mb-8 text-left">
          <label className="block text-sm font-medium text-text-secondary mb-2">
            Server URL
          </label>
          <div className="flex gap-2">
            <input
              type="text"
              value={remoteUrl}
              onChange={(e) => { setRemoteUrl(e.target.value); setTestResult(null); }}
              placeholder="http://192.168.1.100:3401"
              className="flex-1 px-4 py-3 border border-border rounded-lg bg-surface text-text-primary placeholder-text-tertiary focus:outline-none focus:ring-2 focus:ring-primary"
            />
            <button
              onClick={handleTestConnection}
              disabled={!remoteUrl.trim() || testing}
              className="px-4 py-3 border border-border rounded-lg text-text-secondary hover:bg-surface-secondary transition-colors disabled:opacity-50"
            >
              {testing ? (
                <FaSpinner className="animate-spin" />
              ) : (
                'Test'
              )}
            </button>
          </div>
          {testResult === 'success' && (
            <div className="flex items-center gap-2 mt-2 text-success text-sm">
              <FaCheck /> Connection successful
            </div>
          )}
          {testResult === 'error' && (
            <div className="mt-2 text-danger text-sm">
              Could not reach the server. Check the URL and make sure the server is running.
            </div>
          )}
        </div>
      )}

      {/* Continue button */}
      <button
        onClick={handleContinue}
        disabled={!canContinue}
        className="bg-primary text-white px-10 py-3 rounded-lg text-lg font-semibold hover:bg-primary-hover transition-colors disabled:opacity-50"
      >
        Continue
      </button>
    </div>
  );
}
