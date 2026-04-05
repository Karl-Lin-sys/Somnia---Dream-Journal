import { useState, useEffect } from "react";
import { Key } from "lucide-react";

export function ApiKeyPrompt({ onKeySelected }: { onKeySelected: () => void }) {
  const [isChecking, setIsChecking] = useState(true);

  useEffect(() => {
    const checkKey = async () => {
      // @ts-ignore
      if (window.aistudio && window.aistudio.hasSelectedApiKey) {
        // @ts-ignore
        const hasKey = await window.aistudio.hasSelectedApiKey();
        if (hasKey) {
          onKeySelected();
        } else {
          setIsChecking(false);
        }
      } else {
        // Fallback if not in AI Studio environment
        setIsChecking(false);
      }
    };
    checkKey();
  }, [onKeySelected]);

  const handleSelectKey = async () => {
    // @ts-ignore
    if (window.aistudio && window.aistudio.openSelectKey) {
      // @ts-ignore
      await window.aistudio.openSelectKey();
      // Assume success to mitigate race condition
      onKeySelected();
    }
  };

  if (isChecking) {
    return (
      <div className="min-h-screen bg-slate-950 flex items-center justify-center text-white">
        <div className="animate-pulse">Checking API Key status...</div>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-slate-950 flex items-center justify-center p-4">
      <div className="max-w-md w-full bg-slate-900 rounded-2xl p-8 shadow-2xl border border-slate-800 text-center">
        <div className="w-16 h-16 bg-indigo-500/20 rounded-full flex items-center justify-center mx-auto mb-6">
          <Key className="w-8 h-8 text-indigo-400" />
        </div>
        <h1 className="text-2xl font-bold text-white mb-4">API Key Required</h1>
        <p className="text-slate-400 mb-8">
          This application uses advanced image generation models (Gemini 3 Pro Image) which require a paid Google Cloud API key.
          Please select your API key to continue.
        </p>
        <button
          onClick={handleSelectKey}
          className="w-full bg-indigo-600 hover:bg-indigo-700 text-white font-medium py-3 px-4 rounded-xl transition-colors"
        >
          Select API Key
        </button>
        <p className="text-xs text-slate-500 mt-6">
          For more information on billing, visit the{" "}
          <a
            href="https://ai.google.dev/gemini-api/docs/billing"
            target="_blank"
            rel="noreferrer"
            className="text-indigo-400 hover:underline"
          >
            billing documentation
          </a>
          .
        </p>
      </div>
    </div>
  );
}
