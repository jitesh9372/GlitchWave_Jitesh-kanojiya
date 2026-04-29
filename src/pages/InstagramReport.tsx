import React, { useState, useEffect, useRef } from 'react';

import { Upload, ExternalLink, AlertCircle, CheckCircle2, Loader2, Camera, Video, StopCircle, Trash2, Send, X } from 'lucide-react';
import { supabase } from '../supabaseClient';

interface InstagramReport {
  id: string;
  instagram_username: string;
  reel_url: string;
  caption: string;
  created_at: string;
  is_direct_upload?: boolean;
  video_storage_path?: string;
}

const InstagramReportPage = ({ user }: { user: any }) => {
  const [reports, setReports] = useState<InstagramReport[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [uploading, setUploading] = useState(false);
  const [success, setSuccess] = useState<string | null>(null);
  const [showToast, setShowToast] = useState(false);
  const toastTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  // Create Reel States
  const [isRecording, setIsRecording] = useState(false);
  const [recordedBlob, setRecordedBlob] = useState<Blob | null>(null);
  const [previewUrl, setPreviewUrl] = useState<string | null>(null);
  const [caption, setCaption] = useState('');
  const [username, setUsername] = useState('');
  const [cameraError, setCameraError] = useState<string | null>(null);

  const videoRef = useRef<HTMLVideoElement>(null);
  const mediaRecorderRef = useRef<MediaRecorder | null>(null);
  const streamRef = useRef<MediaStream | null>(null);

  useEffect(() => {
    fetchReports();
    startCamera();
    return () => {
      stopCamera();
      if (toastTimerRef.current) clearTimeout(toastTimerRef.current);
    };
  }, []);

  const triggerToast = () => {
    setShowToast(true);
    if (toastTimerRef.current) clearTimeout(toastTimerRef.current);
    toastTimerRef.current = setTimeout(() => {
      setShowToast(false);
    }, 5000);
  };

  const fetchReports = async () => {
    setLoading(true);
    try {
      const { data, error } = await supabase
        .from('Instagram')
        .select('*')
        .order('created_at', { ascending: false });

      if (error) throw error;
      setReports(data || []);
    } catch (err: any) {
      console.error('Supabase Error:', err);
    } finally {
      setLoading(false);
    }
  };

  // Camera Functions
  const startCamera = async () => {
    setCameraError(null);
    try {
      const stream = await navigator.mediaDevices.getUserMedia({ video: true, audio: true });
      streamRef.current = stream;
      if (videoRef.current) {
        videoRef.current.srcObject = stream;
      }
    } catch (err: any) {
      console.error('Camera Error:', err);
      if (err.name === 'NotAllowedError' || err.name === 'PermissionDeniedError') {
        setCameraError('Camera/Microphone permission denied. Please enable access in your browser settings.');
      } else if (err.name === 'NotFoundError' || err.name === 'DevicesNotFoundError') {
        setCameraError('No camera or microphone found. You can still upload a video file.');
      } else {
        setCameraError('Could not access camera: ' + (err.message || 'Unknown error'));
      }
    }
  };

  const stopCamera = () => {
    if (streamRef.current) {
      streamRef.current.getTracks().forEach(track => track.stop());
      streamRef.current = null;
    }
  };

  const startRecording = () => {
    if (!streamRef.current) return;

    const chunks: Blob[] = [];
    const mediaRecorder = new MediaRecorder(streamRef.current);
    mediaRecorderRef.current = mediaRecorder;

    mediaRecorder.ondataavailable = (e) => {
      if (e.data.size > 0) chunks.push(e.data);
    };

    mediaRecorder.onstop = () => {
      const blob = new Blob(chunks, { type: 'video/webm' });
      setRecordedBlob(blob);
      setPreviewUrl(URL.createObjectURL(blob));
    };

    mediaRecorder.start();
    setIsRecording(true);
  };

  const stopRecording = () => {
    if (mediaRecorderRef.current && mediaRecorderRef.current.state === 'recording') {
      mediaRecorderRef.current.stop();
      setIsRecording(false);
    }
  };

  const handleFileUpload = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (file) {
      stopCamera();
      setRecordedBlob(file);
      setPreviewUrl(URL.createObjectURL(file));
    }
  };

  const discardVideo = () => {
    setPreviewUrl(null);
    setRecordedBlob(null);
    startCamera();
  };

  const handleSubmitDirectReel = async () => {
    if (!recordedBlob) {
      setError('Please record or upload a video first.');
      return;
    }
    setUploading(true);
    setError(null);
    setSuccess(null);

    try {
      // Use hyphen instead of space in path to avoid URL encoding issues
      const ext = recordedBlob instanceof File ? recordedBlob.name.split('.').pop() || 'webm' : 'webm';
      const fileName = `instagram_alert_${Date.now()}.${ext}`;
      const filePath = `instagram-alert/${fileName}`;

      // Upload to Supabase Storage
      const { data: uploadData, error: uploadError } = await supabase.storage
        .from('app-files')
        .upload(filePath, recordedBlob, {
          cacheControl: '3600',
          upsert: false,
          contentType: recordedBlob instanceof File ? recordedBlob.type : 'video/webm',
        });

      if (uploadError) {
        throw new Error(`Upload failed: ${uploadError.message}`);
      }

      const { data: { publicUrl } } = supabase.storage
        .from('app-files')
        .getPublicUrl(filePath);

      const { error: dbError } = await supabase
        .from('Instagram')
        .insert([
          {
            user_id: user?.id || null,
            instagram_username: username.trim() || 'Anonymous',
            reel_url: publicUrl,
            caption: caption.trim(),
            is_direct_upload: true,
            video_storage_path: uploadData?.path || filePath,
          },
        ]);

      if (dbError) throw dbError;

      setSuccess('Video uploaded and report submitted successfully!');
      triggerToast();
      setRecordedBlob(null);
      setPreviewUrl(null);
      setCaption('');
      setUsername('');
      fetchReports();
      // Restart camera after discard
      startCamera();
    } catch (err: any) {
      console.error('Upload Error:', err);
      setError(err.message || 'Failed to upload video. Please try again.');
    } finally {
      setUploading(false);
    }
  };

  return (
    <div className="min-h-screen pt-24 pb-12 px-4 bg-slate-50 dark:bg-slate-950 transition-colors">
      <div className="max-w-7xl mx-auto">
        <div className="flex flex-col md:flex-row justify-between items-start md:items-center mb-8 gap-4">
          <div>
            <h1 className="text-4xl font-black text-slate-900 dark:text-white tracking-tight mb-2">
              Instagram Reports
            </h1>
            <p className="text-slate-500 dark:text-slate-400">
              Record or upload emergency videos to submit directly to AlertAxis.
            </p>
          </div>
        </div>

        {/* Global error banner */}
        {error && (
          <div className="mb-6 p-4 bg-red-50 dark:bg-red-900/20 border border-red-200 dark:border-red-900/30 rounded-2xl flex items-center gap-3 text-red-600 dark:text-red-400">
            <AlertCircle className="w-5 h-5 flex-shrink-0" />
            <p className="text-sm font-medium">{error}</p>
          </div>
        )}

        {/* Animated Toast Notification */}
        <div
          style={{
            position: 'fixed',
            bottom: '2rem',
            right: '2rem',
            zIndex: 9999,
            transform: showToast ? 'translateY(0) scale(1)' : 'translateY(120%) scale(0.95)',
            opacity: showToast ? 1 : 0,
            transition: 'transform 0.4s cubic-bezier(0.34, 1.56, 0.64, 1), opacity 0.3s ease',
            pointerEvents: showToast ? 'auto' : 'none',
          }}
        >
          <div style={{
            background: 'linear-gradient(135deg, #10b981, #059669)',
            borderRadius: '1.25rem',
            padding: '1rem 1.25rem',
            display: 'flex',
            alignItems: 'center',
            gap: '0.75rem',
            boxShadow: '0 20px 60px rgba(16,185,129,0.35), 0 4px 16px rgba(0,0,0,0.2)',
            minWidth: '300px',
            maxWidth: '380px',
            overflow: 'hidden',
            position: 'relative',
          }}>
            {/* Progress bar */}
            <div style={{
              position: 'absolute',
              bottom: 0,
              left: 0,
              height: '3px',
              background: 'rgba(255,255,255,0.4)',
              width: showToast ? '0%' : '100%',
              transition: showToast ? 'width 5s linear' : 'none',
              borderRadius: '0 0 1.25rem 1.25rem',
            }} />
            {/* Icon */}
            <div style={{
              width: '2.5rem',
              height: '2.5rem',
              background: 'rgba(255,255,255,0.2)',
              borderRadius: '50%',
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'center',
              flexShrink: 0,
            }}>
              <CheckCircle2 style={{ width: '1.25rem', height: '1.25rem', color: 'white' }} />
            </div>
            {/* Text */}
            <div style={{ flex: 1 }}>
              <p style={{ color: 'white', fontWeight: 800, fontSize: '0.875rem', margin: 0 }}>Upload Successful!</p>
              <p style={{ color: 'rgba(255,255,255,0.8)', fontSize: '0.75rem', marginTop: '0.125rem' }}>Your emergency video has been submitted to AlertAxis.</p>
            </div>
            {/* Close */}
            <button
              onClick={() => setShowToast(false)}
              style={{
                background: 'rgba(255,255,255,0.15)',
                border: 'none',
                borderRadius: '50%',
                width: '1.75rem',
                height: '1.75rem',
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'center',
                cursor: 'pointer',
                flexShrink: 0,
              }}
            >
              <X style={{ width: '0.875rem', height: '0.875rem', color: 'white' }} />
            </button>
          </div>
        </div>

        <div className="grid grid-cols-1 lg:grid-cols-3 gap-8">
          {/* Left: Camera + Form */}
          <div className="lg:col-span-2">
            <div className="bg-white dark:bg-slate-900 rounded-[32px] border border-slate-100 dark:border-slate-800 p-8">
              <div className="grid grid-cols-1 md:grid-cols-2 gap-8">

                {/* Camera/Preview Section */}
                <div className="space-y-4">
                  <div className="aspect-[9/16] bg-slate-100 dark:bg-slate-800 rounded-3xl overflow-hidden relative border-2 border-dashed border-slate-200 dark:border-slate-700">
                    {previewUrl ? (
                      <video src={previewUrl} className="w-full h-full object-cover" controls />
                    ) : (
                      <>
                        <video ref={videoRef} autoPlay muted playsInline className="w-full h-full object-cover" />
                        {cameraError && (
                          <div className="absolute inset-0 flex flex-col items-center justify-center bg-slate-900/80 p-4 text-center">
                            <Camera className="w-10 h-10 text-slate-400 mb-3" />
                            <p className="text-xs text-slate-300">{cameraError}</p>
                          </div>
                        )}
                        {!cameraError && !isRecording && (
                          <div className="absolute inset-0 flex items-center justify-center bg-black/10 pointer-events-none">
                            <Camera className="w-12 h-12 text-white opacity-40" />
                          </div>
                        )}
                      </>
                    )}

                    {isRecording && (
                      <div className="absolute top-4 left-4 flex items-center gap-2 px-3 py-1 bg-red-500 text-white text-xs font-bold rounded-full animate-pulse">
                        <div className="w-2 h-2 bg-white rounded-full" />
                        RECORDING
                      </div>
                    )}
                  </div>

                  {/* Controls */}
                  <div className="flex items-center justify-center gap-4">
                    {!previewUrl ? (
                      <>
                        {!isRecording ? (
                          <button
                            onClick={startRecording}
                            disabled={!streamRef.current}
                            title="Start recording"
                            className="w-16 h-16 bg-red-500 rounded-full flex items-center justify-center text-white shadow-lg hover:bg-red-600 transition-all disabled:opacity-40 disabled:cursor-not-allowed"
                          >
                            <Video className="w-8 h-8" />
                          </button>
                        ) : (
                          <button
                            onClick={stopRecording}
                            title="Stop recording"
                            className="w-16 h-16 bg-slate-900 dark:bg-white rounded-full flex items-center justify-center text-white dark:text-slate-900 shadow-lg hover:scale-105 transition-all"
                          >
                            <StopCircle className="w-8 h-8" />
                          </button>
                        )}
                        <label
                          title="Upload video file"
                          className="w-16 h-16 bg-white dark:bg-slate-800 border border-slate-200 dark:border-slate-700 rounded-full flex items-center justify-center text-slate-600 dark:text-slate-300 shadow-sm hover:bg-slate-50 dark:hover:bg-slate-700 transition-all cursor-pointer"
                        >
                          <Upload className="w-6 h-6" />
                          <input type="file" accept="video/*" className="hidden" onChange={handleFileUpload} />
                        </label>
                      </>
                    ) : (
                      <button
                        onClick={discardVideo}
                        className="inline-flex items-center gap-2 px-6 py-3 bg-slate-100 dark:bg-slate-800 text-slate-600 dark:text-slate-300 font-bold rounded-2xl hover:bg-slate-200 dark:hover:bg-slate-700 transition-all"
                      >
                        <Trash2 className="w-5 h-5" />
                        Discard
                      </button>
                    )}
                  </div>
                </div>

                {/* Form Section */}
                <div className="space-y-6">
                  <div>
                    <h3 className="text-2xl font-black text-slate-900 dark:text-white mb-2">Create Direct Reel</h3>
                    <p className="text-sm text-slate-500 dark:text-slate-400">Record or upload a video to report directly to AlertAxis.</p>
                  </div>

                  <div className="space-y-4">
                    <div>
                      <label className="block text-xs font-bold text-slate-400 dark:text-slate-500 uppercase tracking-widest mb-2">
                        Instagram Username (Optional)
                      </label>
                      <input
                        type="text"
                        value={username}
                        onChange={(e) => setUsername(e.target.value)}
                        placeholder="@yourusername"
                        className="w-full px-4 py-3 bg-slate-50 dark:bg-slate-800 border border-slate-200 dark:border-slate-700 rounded-2xl text-slate-900 dark:text-white focus:ring-2 focus:ring-red-400 outline-none transition-all"
                      />
                    </div>

                    <div>
                      <label className="block text-xs font-bold text-slate-400 dark:text-slate-500 uppercase tracking-widest mb-2">
                        Caption / Emergency Details
                      </label>
                      <textarea
                        value={caption}
                        onChange={(e) => setCaption(e.target.value)}
                        placeholder="Describe the emergency situation..."
                        rows={4}
                        className="w-full px-4 py-3 bg-slate-50 dark:bg-slate-800 border border-slate-200 dark:border-slate-700 rounded-2xl text-slate-900 dark:text-white focus:ring-2 focus:ring-red-400 outline-none transition-all resize-none"
                      />
                    </div>

                    {!recordedBlob && (
                      <div className="p-3 bg-amber-50 dark:bg-amber-900/20 rounded-2xl border border-amber-200 dark:border-amber-800">
                        <p className="text-xs text-amber-600 dark:text-amber-400 font-medium flex items-center gap-2">
                          <AlertCircle className="w-4 h-4" />
                          Record a video or upload a file before submitting.
                        </p>
                      </div>
                    )}

                    {recordedBlob && (
                      <div className="p-3 bg-emerald-50 dark:bg-emerald-900/20 rounded-2xl border border-emerald-200 dark:border-emerald-800">
                        <p className="text-xs text-emerald-600 dark:text-emerald-400 font-medium flex items-center gap-2">
                          <CheckCircle2 className="w-4 h-4" />
                          Video ready — fill in details and submit.
                        </p>
                      </div>
                    )}

                    <button
                      onClick={handleSubmitDirectReel}
                      disabled={uploading || !recordedBlob}
                      className="w-full py-4 bg-red-500 text-white font-black rounded-2xl shadow-lg shadow-red-200 dark:shadow-none hover:bg-red-600 transition-all disabled:opacity-40 disabled:cursor-not-allowed flex items-center justify-center gap-2"
                    >
                      {uploading ? (
                        <>
                          <Loader2 className="w-5 h-5 animate-spin" />
                          Uploading...
                        </>
                      ) : (
                        <>
                          <Send className="w-5 h-5" />
                          Submit Report
                        </>
                      )}
                    </button>
                  </div>
                </div>
              </div>
            </div>
          </div>

          {/* Right: Reported History */}
          <div className="lg:col-span-1">
            <h2 className="text-xl font-bold text-slate-900 dark:text-white mb-6 flex items-center gap-2">
              <CheckCircle2 className="w-5 h-5 text-emerald-500" />
              Reported History
            </h2>
            <div className="space-y-4 max-h-[800px] overflow-y-auto pr-2">
              {loading ? (
                <div className="p-8 bg-white dark:bg-slate-900 rounded-[32px] border border-slate-100 dark:border-slate-800 text-center">
                  <Loader2 className="w-6 h-6 animate-spin mx-auto text-slate-400" />
                </div>
              ) : reports.length === 0 ? (
                <div className="p-8 bg-white dark:bg-slate-900 rounded-[32px] border border-slate-100 dark:border-slate-800 text-center">
                  <p className="text-slate-500 dark:text-slate-400 text-sm">No reports yet.</p>
                </div>
              ) : (
                reports.map((report) => (
                  <div
                    key={report.id}
                    className="p-4 bg-white dark:bg-slate-900 rounded-2xl border border-slate-100 dark:border-slate-800 shadow-sm"
                  >
                    <div className="flex items-center justify-between mb-2">
                      <div className="flex items-center gap-2">
                        {report.is_direct_upload && (
                          <span className="px-2 py-0.5 bg-blue-100 dark:bg-blue-900/30 text-blue-600 dark:text-blue-400 text-[10px] font-bold rounded-full">
                            DIRECT
                          </span>
                        )}
                      </div>
                      <span className="text-[10px] text-slate-400 dark:text-slate-500">
                        {new Date(report.created_at).toLocaleString('en-IN', { timeZone: 'Asia/Kolkata' })}
                      </span>
                    </div>
                    <p className="text-sm font-medium text-slate-900 dark:text-white line-clamp-2 mb-2">
                      {report.caption || 'No caption'}
                    </p>
                    <div className="flex items-center justify-between">
                      <span className="text-[10px] text-slate-400 dark:text-slate-500">
                        By: {report.instagram_username}
                      </span>
                      {report.reel_url && (
                        <a
                          href={report.reel_url}
                          target="_blank"
                          rel="noopener noreferrer"
                          className="text-xs text-slate-500 hover:text-red-500 flex items-center gap-1 transition-colors"
                        >
                          View <ExternalLink className="w-3 h-3" />
                        </a>
                      )}
                    </div>
                  </div>
                ))
              )}
            </div>
          </div>
        </div>
      </div>
    </div>
  );
};

export default InstagramReportPage;
