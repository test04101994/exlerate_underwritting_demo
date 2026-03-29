import { useState, useRef, useCallback } from 'react';

interface ScreenRecordingOptions {
  mimeType?: string;
  videoBitsPerSecond?: number;
}

interface ScreenRecordingState {
  isRecording: boolean;
  isPaused: boolean;
  recordingTime: number;
  error: string | null;
}

export function useScreenRecording(options: ScreenRecordingOptions = {}) {
  const [state, setState] = useState<ScreenRecordingState>({
    isRecording: false,
    isPaused: false,
    recordingTime: 0,
    error: null,
  });

  const mediaRecorderRef = useRef<MediaRecorder | null>(null);
  const chunksRef = useRef<Blob[]>([]);
  const streamRef = useRef<MediaStream | null>(null);
  const timerRef = useRef<NodeJS.Timeout | null>(null);

  const startRecording = useCallback(async () => {
    try {
      // Request screen capture
      const stream = await navigator.mediaDevices.getDisplayMedia({
        video: {
          displaySurface: 'browser',
        } as MediaTrackConstraints,
        audio: false,
      });

      streamRef.current = stream;

      // Determine supported MIME type
      const mimeTypes = [
        'video/webm;codecs=vp9',
        'video/webm;codecs=vp8',
        'video/webm',
        'video/mp4',
      ];

      const supportedMimeType = mimeTypes.find((type) =>
        MediaRecorder.isTypeSupported(type)
      );

      if (!supportedMimeType) {
        throw new Error('No supported MIME type found for recording');
      }

      // Create MediaRecorder
      const mediaRecorder = new MediaRecorder(stream, {
        mimeType: supportedMimeType,
        videoBitsPerSecond: options.videoBitsPerSecond || 2500000, // 2.5 Mbps
      });

      chunksRef.current = [];

      mediaRecorder.ondataavailable = (event) => {
        if (event.data.size > 0) {
          chunksRef.current.push(event.data);
        }
      };

      mediaRecorder.onstart = () => {
        setState((prev) => ({
          ...prev,
          isRecording: true,
          recordingTime: 0,
          error: null,
        }));

        // Start timer
        timerRef.current = setInterval(() => {
          setState((prev) => ({
            ...prev,
            recordingTime: prev.recordingTime + 1,
          }));
        }, 1000);
      };

      mediaRecorder.onstop = () => {
        if (timerRef.current) {
          clearInterval(timerRef.current);
        }
        setState((prev) => ({
          ...prev,
          isRecording: false,
          isPaused: false,
        }));
      };

      // Handle user stopping the screen share via browser UI
      stream.getVideoTracks()[0].addEventListener('ended', () => {
        // Update state immediately when user stops via browser
        if (timerRef.current) {
          clearInterval(timerRef.current);
        }
        setState((prev) => ({
          ...prev,
          isRecording: false,
          isPaused: false,
        }));
      });

      mediaRecorderRef.current = mediaRecorder;
      mediaRecorder.start(1000); // Collect data every second
    } catch (error) {
      console.error('Error starting screen recording:', error);
      setState((prev) => ({
        ...prev,
        error: error instanceof Error ? error.message : 'Failed to start recording',
      }));
    }
  }, [options.videoBitsPerSecond]);

  const stopRecording = useCallback((): Promise<Blob> => {
    return new Promise((resolve) => {
      const mediaRecorder = mediaRecorderRef.current;
      
      // If no recorder exists, return empty blob
      if (!mediaRecorder) {
        resolve(new Blob());
        return;
      }

      // If already inactive (user stopped via browser), create blob from existing chunks
      if (mediaRecorder.state === 'inactive') {
        if (timerRef.current) {
          clearInterval(timerRef.current);
        }

        // Create blob from accumulated chunks
        const blob = new Blob(chunksRef.current, {
          type: mediaRecorder.mimeType || 'video/webm',
        });

        // Stop all tracks
        if (streamRef.current) {
          streamRef.current.getTracks().forEach((track) => track.stop());
        }

        setState((prev) => ({
          ...prev,
          isRecording: false,
          isPaused: false,
        }));

        chunksRef.current = [];
        resolve(blob);
        return;
      }

      // If still recording, stop it normally
      mediaRecorder.onstop = () => {
        if (timerRef.current) {
          clearInterval(timerRef.current);
        }

        const blob = new Blob(chunksRef.current, {
          type: mediaRecorder.mimeType,
        });

        // Stop all tracks
        if (streamRef.current) {
          streamRef.current.getTracks().forEach((track) => track.stop());
        }

        setState((prev) => ({
          ...prev,
          isRecording: false,
          isPaused: false,
        }));

        chunksRef.current = [];
        resolve(blob);
      };

      mediaRecorder.stop();
    });
  }, []);

  const pauseRecording = useCallback(() => {
    if (mediaRecorderRef.current && mediaRecorderRef.current.state === 'recording') {
      mediaRecorderRef.current.pause();
      if (timerRef.current) {
        clearInterval(timerRef.current);
      }
      setState((prev) => ({ ...prev, isPaused: true }));
    }
  }, []);

  const resumeRecording = useCallback(() => {
    if (mediaRecorderRef.current && mediaRecorderRef.current.state === 'paused') {
      mediaRecorderRef.current.resume();
      timerRef.current = setInterval(() => {
        setState((prev) => ({
          ...prev,
          recordingTime: prev.recordingTime + 1,
        }));
      }, 1000);
      setState((prev) => ({ ...prev, isPaused: false }));
    }
  }, []);

  return {
    ...state,
    startRecording,
    stopRecording,
    pauseRecording,
    resumeRecording,
  };
}
