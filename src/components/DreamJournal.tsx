import React, { useState, useRef, useEffect } from "react";
import { Mic, Square, Loader2, Image as ImageIcon, Send, Sparkles, RefreshCw } from "lucide-react";
import { GoogleGenAI, Type } from "@google/genai";
import ReactMarkdown from "react-markdown";
import { motion, AnimatePresence } from "motion/react";
import { cn } from "../lib/utils";

type AppState = "idle" | "recording" | "processing" | "review" | "analyzing" | "result";

type ChatMessage = {
  role: "user" | "model";
  text: string;
};

export function DreamJournal() {
  const [appState, setAppState] = useState<AppState>("idle");
  const [transcription, setTranscription] = useState("");
  const [imageSize, setImageSize] = useState<"1K" | "2K" | "4K">("1K");
  const [generatedImage, setGeneratedImage] = useState<string | null>(null);
  const [interpretation, setInterpretation] = useState("");
  const [chatHistory, setChatHistory] = useState<ChatMessage[]>([]);
  const [chatInput, setChatInput] = useState("");
  const [isChatting, setIsChatting] = useState(false);
  const [recordingTime, setRecordingTime] = useState(0);

  const mediaRecorderRef = useRef<MediaRecorder | null>(null);
  const audioChunksRef = useRef<Blob[]>([]);
  const timerRef = useRef<number | null>(null);
  const chatEndRef = useRef<HTMLDivElement>(null);

  // Auto-scroll chat
  useEffect(() => {
    if (chatEndRef.current) {
      chatEndRef.current.scrollIntoView({ behavior: "smooth" });
    }
  }, [chatHistory, isChatting]);

  const startRecording = async () => {
    try {
      const stream = await navigator.mediaDevices.getUserMedia({ audio: true });
      const mediaRecorder = new MediaRecorder(stream);
      mediaRecorderRef.current = mediaRecorder;
      audioChunksRef.current = [];

      mediaRecorder.ondataavailable = (e) => {
        if (e.data.size > 0) {
          audioChunksRef.current.push(e.data);
        }
      };

      mediaRecorder.onstop = async () => {
        const audioBlob = new Blob(audioChunksRef.current, { type: "audio/webm" });
        await processAudio(audioBlob);
      };

      mediaRecorder.start();
      setAppState("recording");
      setRecordingTime(0);
      timerRef.current = window.setInterval(() => {
        setRecordingTime((prev) => prev + 1);
      }, 1000);
    } catch (err) {
      console.error("Error accessing microphone:", err);
      alert("Could not access microphone. Please ensure permissions are granted.");
    }
  };

  const stopRecording = () => {
    if (mediaRecorderRef.current && mediaRecorderRef.current.state === "recording") {
      mediaRecorderRef.current.stop();
      mediaRecorderRef.current.stream.getTracks().forEach((track) => track.stop());
      if (timerRef.current) clearInterval(timerRef.current);
      setAppState("processing");
    }
  };

  const processAudio = async (audioBlob: Blob) => {
    try {
      const reader = new FileReader();
      reader.readAsDataURL(audioBlob);
      reader.onloadend = async () => {
        const base64data = reader.result as string;
        const base64String = base64data.split(",")[1];

        // Ensure we use the latest API key
        const ai = new GoogleGenAI({ apiKey: process.env.GEMINI_API_KEY });
        
        const response = await ai.models.generateContent({
          model: "gemini-3-flash-preview",
          contents: [
            {
              inlineData: {
                data: base64String,
                mimeType: "audio/webm",
              },
            },
            "Transcribe this dream recording accurately. Only output the transcription, nothing else.",
          ],
        });

        setTranscription(response.text || "Could not transcribe audio.");
        setAppState("review");
      };
    } catch (error) {
      console.error("Transcription error:", error);
      setTranscription("An error occurred during transcription.");
      setAppState("review");
    }
  };

  const analyzeDream = async () => {
    setAppState("analyzing");
    try {
      const ai = new GoogleGenAI({ apiKey: process.env.GEMINI_API_KEY });

      // 1. Generate Image
      const imagePromise = ai.models.generateContent({
        model: "gemini-3-pro-image-preview",
        contents: `A surrealist painting representing the core emotional theme of this dream: ${transcription}`,
        config: {
          imageConfig: {
            aspectRatio: "16:9",
            imageSize: imageSize,
          },
        },
      });

      // 2. Generate Interpretation
      const interpretationPromise = ai.models.generateContent({
        model: "gemini-3.1-pro-preview",
        contents: `Provide a structured psychological interpretation of the following dream based on Jungian archetypes. Break it down into: 1. Core Theme, 2. Key Symbols & Archetypes, 3. Psychological Meaning. Keep it insightful and empathetic.\n\nDream: ${transcription}`,
      });

      const [imageResponse, interpResponse] = await Promise.all([imagePromise, interpretationPromise]);

      // Extract image
      let imgUrl = null;
      if (imageResponse.candidates?.[0]?.content?.parts) {
        for (const part of imageResponse.candidates[0].content.parts) {
          if (part.inlineData) {
            imgUrl = `data:${part.inlineData.mimeType || 'image/png'};base64,${part.inlineData.data}`;
            break;
          }
        }
      }

      setGeneratedImage(imgUrl);
      setInterpretation(interpResponse.text || "Could not generate interpretation.");
      setAppState("result");
    } catch (error) {
      console.error("Analysis error:", error);
      alert("An error occurred during analysis. Please try again.");
      setAppState("review");
    }
  };

  const sendChatMessage = async () => {
    if (!chatInput.trim()) return;

    const newUserMsg: ChatMessage = { role: "user", text: chatInput };
    setChatHistory((prev) => [...prev, newUserMsg]);
    setChatInput("");
    setIsChatting(true);

    try {
      const ai = new GoogleGenAI({ apiKey: process.env.GEMINI_API_KEY });
      
      // Build conversation history for the model
      const contents = [
        `The user had this dream: "${transcription}".\n\nHere is the initial Jungian interpretation you provided:\n${interpretation}\n\nPlease answer the user's follow-up questions about their dream symbols and meanings.`,
        ...chatHistory.map(msg => msg.text),
        newUserMsg.text
      ];

      const response = await ai.models.generateContent({
        model: "gemini-3.1-pro-preview",
        contents: contents,
        config: {
          systemInstruction: "You are an empathetic Jungian dream analyst. Help the user explore the symbols and emotions in their dream. Keep responses concise, insightful, and conversational.",
        }
      });

      setChatHistory((prev) => [...prev, { role: "model", text: response.text || "I'm not sure how to answer that." }]);
    } catch (error) {
      console.error("Chat error:", error);
      setChatHistory((prev) => [...prev, { role: "model", text: "Sorry, I encountered an error processing your question." }]);
    } finally {
      setIsChatting(false);
    }
  };

  const formatTime = (seconds: number) => {
    const m = Math.floor(seconds / 60).toString().padStart(2, "0");
    const s = (seconds % 60).toString().padStart(2, "0");
    return `${m}:${s}`;
  };

  const reset = () => {
    setAppState("idle");
    setTranscription("");
    setGeneratedImage(null);
    setInterpretation("");
    setChatHistory([]);
  };

  return (
    <div className="min-h-screen bg-slate-950 text-slate-200 font-sans selection:bg-indigo-500/30">
      <header className="border-b border-slate-800/50 bg-slate-950/50 backdrop-blur-xl sticky top-0 z-10">
        <div className="max-w-5xl mx-auto px-4 h-16 flex items-center justify-between">
          <div className="flex items-center gap-2">
            <Sparkles className="w-5 h-5 text-indigo-400" />
            <h1 className="font-medium text-lg tracking-tight text-white">Somnia</h1>
          </div>
          {appState === "result" && (
            <button onClick={reset} className="text-sm text-slate-400 hover:text-white transition-colors flex items-center gap-2">
              <RefreshCw className="w-4 h-4" /> New Dream
            </button>
          )}
        </div>
      </header>

      <main className="max-w-5xl mx-auto px-4 py-8">
        <AnimatePresence mode="wait">
          {/* IDLE & RECORDING STATE */}
          {(appState === "idle" || appState === "recording" || appState === "processing") && (
            <motion.div
              key="record"
              initial={{ opacity: 0, y: 20 }}
              animate={{ opacity: 1, y: 0 }}
              exit={{ opacity: 0, y: -20 }}
              className="flex flex-col items-center justify-center min-h-[60vh]"
            >
              <div className="text-center mb-12">
                <h2 className="text-4xl md:text-5xl font-medium text-white mb-4 tracking-tight">Record your dream</h2>
                <p className="text-slate-400 text-lg">Speak naturally while the memory is fresh.</p>
              </div>

              <div className="relative">
                {appState === "recording" && (
                  <motion.div
                    initial={{ scale: 0.8, opacity: 0 }}
                    animate={{ scale: [1, 1.2, 1], opacity: [0.5, 0.8, 0.5] }}
                    transition={{ repeat: Infinity, duration: 2 }}
                    className="absolute inset-0 bg-indigo-500/20 rounded-full blur-xl"
                  />
                )}
                
                <button
                  onClick={appState === "idle" ? startRecording : stopRecording}
                  disabled={appState === "processing"}
                  className={cn(
                    "relative w-24 h-24 rounded-full flex items-center justify-center transition-all duration-300 shadow-2xl",
                    appState === "idle" ? "bg-indigo-600 hover:bg-indigo-500 hover:scale-105" : 
                    appState === "recording" ? "bg-rose-500 hover:bg-rose-600 scale-110" : 
                    "bg-slate-800 cursor-not-allowed"
                  )}
                >
                  {appState === "idle" && <Mic className="w-10 h-10 text-white" />}
                  {appState === "recording" && <Square className="w-8 h-8 text-white fill-current" />}
                  {appState === "processing" && <Loader2 className="w-8 h-8 text-indigo-400 animate-spin" />}
                </button>
              </div>

              <div className="mt-8 h-8 flex items-center justify-center">
                {appState === "recording" && (
                  <span className="text-rose-400 font-mono text-xl">{formatTime(recordingTime)}</span>
                )}
                {appState === "processing" && (
                  <span className="text-indigo-400 animate-pulse">Transcribing...</span>
                )}
              </div>
            </motion.div>
          )}

          {/* REVIEW STATE */}
          {(appState === "review" || appState === "analyzing") && (
            <motion.div
              key="review"
              initial={{ opacity: 0, y: 20 }}
              animate={{ opacity: 1, y: 0 }}
              exit={{ opacity: 0, y: -20 }}
              className="max-w-2xl mx-auto w-full"
            >
              <h3 className="text-xl font-medium text-white mb-6">Review Transcription</h3>
              
              <div className="bg-slate-900/50 border border-slate-800 rounded-2xl p-1 overflow-hidden mb-8">
                <textarea
                  value={transcription}
                  onChange={(e) => setTranscription(e.target.value)}
                  disabled={appState === "analyzing"}
                  className="w-full h-48 bg-transparent text-slate-200 p-4 resize-none focus:outline-none focus:ring-2 focus:ring-indigo-500/50 rounded-xl"
                  placeholder="Your dream transcription will appear here..."
                />
              </div>

              <div className="flex flex-col sm:flex-row items-center justify-between gap-6 bg-slate-900/30 p-6 rounded-2xl border border-slate-800/50">
                <div className="flex-1 w-full">
                  <label className="block text-sm font-medium text-slate-400 mb-2 flex items-center gap-2">
                    <ImageIcon className="w-4 h-4" /> Image Resolution
                  </label>
                  <div className="flex gap-2">
                    {(["1K", "2K", "4K"] as const).map((size) => (
                      <button
                        key={size}
                        onClick={() => setImageSize(size)}
                        disabled={appState === "analyzing"}
                        className={cn(
                          "flex-1 py-2 px-3 rounded-lg text-sm font-medium transition-colors border",
                          imageSize === size 
                            ? "bg-indigo-500/20 text-indigo-300 border-indigo-500/50" 
                            : "bg-slate-800/50 text-slate-400 border-transparent hover:bg-slate-800 disabled:opacity-50"
                        )}
                      >
                        {size}
                      </button>
                    ))}
                  </div>
                </div>

                <button
                  onClick={analyzeDream}
                  disabled={appState === "analyzing" || !transcription.trim()}
                  className="w-full sm:w-auto bg-indigo-600 hover:bg-indigo-500 text-white px-8 py-3 rounded-xl font-medium transition-all disabled:opacity-50 disabled:cursor-not-allowed flex items-center justify-center gap-2 min-w-[200px]"
                >
                  {appState === "analyzing" ? (
                    <>
                      <Loader2 className="w-5 h-5 animate-spin" /> Analyzing...
                    </>
                  ) : (
                    <>
                      <Sparkles className="w-5 h-5" /> Analyze & Visualize
                    </>
                  )}
                </button>
              </div>
            </motion.div>
          )}

          {/* RESULT STATE */}
          {appState === "result" && (
            <motion.div
              key="result"
              initial={{ opacity: 0 }}
              animate={{ opacity: 1 }}
              className="grid grid-cols-1 lg:grid-cols-12 gap-8"
            >
              {/* Left Column: Image & Interpretation */}
              <div className="lg:col-span-7 space-y-8">
                {generatedImage && (
                  <motion.div 
                    initial={{ opacity: 0, scale: 0.95 }}
                    animate={{ opacity: 1, scale: 1 }}
                    transition={{ delay: 0.2 }}
                    className="rounded-2xl overflow-hidden border border-slate-800 bg-slate-900 shadow-2xl"
                  >
                    <img src={generatedImage} alt="Dream visualization" className="w-full h-auto object-cover" referrerPolicy="no-referrer" />
                  </motion.div>
                )}

                <motion.div 
                  initial={{ opacity: 0, y: 20 }}
                  animate={{ opacity: 1, y: 0 }}
                  transition={{ delay: 0.4 }}
                  className="bg-slate-900/50 border border-slate-800 rounded-2xl p-6 md:p-8"
                >
                  <h3 className="text-xl font-medium text-white mb-6 flex items-center gap-2">
                    <Sparkles className="w-5 h-5 text-indigo-400" /> Psychological Interpretation
                  </h3>
                  <div className="prose prose-invert prose-indigo max-w-none prose-p:leading-relaxed prose-headings:font-medium">
                    <ReactMarkdown>{interpretation}</ReactMarkdown>
                  </div>
                </motion.div>
              </div>

              {/* Right Column: Chat */}
              <motion.div 
                initial={{ opacity: 0, x: 20 }}
                animate={{ opacity: 1, x: 0 }}
                transition={{ delay: 0.6 }}
                className="lg:col-span-5 flex flex-col h-[600px] lg:h-[calc(100vh-8rem)] lg:sticky lg:top-24 bg-slate-900/50 border border-slate-800 rounded-2xl overflow-hidden"
              >
                <div className="p-4 border-b border-slate-800 bg-slate-900/80 backdrop-blur-sm">
                  <h3 className="font-medium text-white">Dream Analyst</h3>
                  <p className="text-xs text-slate-400">Ask about specific symbols or feelings</p>
                </div>

                <div className="flex-1 overflow-y-auto p-4 space-y-4">
                  {chatHistory.length === 0 ? (
                    <div className="h-full flex flex-col items-center justify-center text-center text-slate-500 p-4">
                      <Sparkles className="w-8 h-8 mb-3 opacity-50" />
                      <p>What specific part of the dream would you like to explore further?</p>
                    </div>
                  ) : (
                    chatHistory.map((msg, idx) => (
                      <div key={idx} className={cn("flex", msg.role === "user" ? "justify-end" : "justify-start")}>
                        <div 
                          className={cn(
                            "max-w-[85%] rounded-2xl px-4 py-3 text-sm leading-relaxed",
                            msg.role === "user" 
                              ? "bg-indigo-600 text-white rounded-tr-sm" 
                              : "bg-slate-800 text-slate-200 rounded-tl-sm border border-slate-700"
                          )}
                        >
                          {msg.role === "model" ? (
                            <div className="prose prose-invert prose-sm max-w-none">
                              <ReactMarkdown>{msg.text}</ReactMarkdown>
                            </div>
                          ) : (
                            msg.text
                          )}
                        </div>
                      </div>
                    ))
                  )}
                  {isChatting && (
                    <div className="flex justify-start">
                      <div className="bg-slate-800 border border-slate-700 rounded-2xl rounded-tl-sm px-4 py-3 flex items-center gap-2">
                        <span className="w-2 h-2 bg-slate-500 rounded-full animate-bounce" />
                        <span className="w-2 h-2 bg-slate-500 rounded-full animate-bounce" style={{ animationDelay: "0.2s" }} />
                        <span className="w-2 h-2 bg-slate-500 rounded-full animate-bounce" style={{ animationDelay: "0.4s" }} />
                      </div>
                    </div>
                  )}
                  <div ref={chatEndRef} />
                </div>

                <div className="p-4 bg-slate-900/80 border-t border-slate-800">
                  <form 
                    onSubmit={(e) => { e.preventDefault(); sendChatMessage(); }}
                    className="flex gap-2"
                  >
                    <input
                      type="text"
                      value={chatInput}
                      onChange={(e) => setChatInput(e.target.value)}
                      placeholder="Ask about a symbol..."
                      disabled={isChatting}
                      className="flex-1 bg-slate-950 border border-slate-700 rounded-xl px-4 py-2.5 text-sm text-white focus:outline-none focus:ring-2 focus:ring-indigo-500/50 disabled:opacity-50"
                    />
                    <button
                      type="submit"
                      disabled={!chatInput.trim() || isChatting}
                      className="bg-indigo-600 hover:bg-indigo-500 text-white p-2.5 rounded-xl transition-colors disabled:opacity-50 disabled:cursor-not-allowed flex items-center justify-center"
                    >
                      <Send className="w-4 h-4" />
                    </button>
                  </form>
                </div>
              </motion.div>
            </motion.div>
          )}
        </AnimatePresence>
      </main>
    </div>
  );
}
