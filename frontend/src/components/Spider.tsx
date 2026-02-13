/**
 * Cute Fluffy SpiderEye Component
 * 
 * A fluffy black spider that hangs from a thread, types along with the user,
 * and covers its eyes for password privacy.
 */

import React, { useEffect, useRef, useState, useCallback, RefObject } from 'react';
import './Spider.css';

// ============================================
// TYPES
// ============================================

export interface SpiderEyeProps {
  isClosed?: boolean;
  size?: number;
  pupilPosition?: { x: number; y: number };
  isSubmitting?: boolean;
  isTyping?: boolean;
  className?: string;
}

export interface UseSpiderEyeReturn {
  containerRef: RefObject<HTMLDivElement>;
  usernameRef: RefObject<HTMLInputElement>;
  passwordRef: RefObject<HTMLInputElement>;
  isClosed: boolean;
  isSubmitting: boolean;
  isTyping: boolean;
  pupilPosition: { x: number; y: number };
  triggerSubmitAnimation: () => void;
}

// ============================================
// HOOK: useSpiderEye
// ============================================

export function useSpiderEye(): UseSpiderEyeReturn {
  const containerRef = useRef<HTMLDivElement>(null);
  const usernameRef = useRef<HTMLInputElement>(null);
  const passwordRef = useRef<HTMLInputElement>(null);
  
  const [isClosed, setIsClosed] = useState(false);
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [isTyping, setIsTyping] = useState(false);
  const [pupilPosition, setPupilPosition] = useState({ x: 0, y: 0 });
  const typingTimeoutRef = useRef<NodeJS.Timeout | null>(null);
  const animationFrameRef = useRef<number | null>(null);

  // Track cursor movement with smooth animation
  useEffect(() => {
    let currentX = 0;
    let currentY = 0;
    let targetX = 0;
    let targetY = 0;

    const handleMouseMove = (e: MouseEvent) => {
      if (!containerRef.current || isClosed) return;
      
      const rect = containerRef.current.getBoundingClientRect();
      const centerX = rect.left + rect.width / 2;
      const centerY = rect.top + rect.height / 2;
      
      const deltaX = (e.clientX - centerX) / (window.innerWidth / 2);
      const deltaY = (e.clientY - centerY) / (window.innerHeight / 2);
      
      // Increased range for more dynamic movement (0.5 instead of 0.35)
      targetX = Math.max(-1, Math.min(1, deltaX)) * 0.5;
      targetY = Math.max(-1, Math.min(1, deltaY)) * 0.5;
    };

    // Smooth animation loop for fluid eye tracking
    const animateEyes = () => {
      // Smooth easing towards target position
      const easing = 0.15; // Adjust for more/less smoothness
      currentX += (targetX - currentX) * easing;
      currentY += (targetY - currentY) * easing;
      
      setPupilPosition({ x: currentX, y: currentY });
      animationFrameRef.current = requestAnimationFrame(animateEyes);
    };

    window.addEventListener('mousemove', handleMouseMove);
    animationFrameRef.current = requestAnimationFrame(animateEyes);

    return () => {
      window.removeEventListener('mousemove', handleMouseMove);
      if (animationFrameRef.current) {
        cancelAnimationFrame(animationFrameRef.current);
      }
    };
  }, [isClosed]);

  // Handle username input - trigger typing animation
  useEffect(() => {
    const usernameInput = usernameRef.current;
    if (!usernameInput) return;

    const handleInput = () => {
      setIsTyping(true);
      
      if (typingTimeoutRef.current) {
        clearTimeout(typingTimeoutRef.current);
      }
      
      typingTimeoutRef.current = setTimeout(() => {
        setIsTyping(false);
      }, 200);
    };

    const handleFocus = () => {
      // Look at the input
      setPupilPosition({ x: 0, y: 0.3 });
    };

    usernameInput.addEventListener('input', handleInput);
    usernameInput.addEventListener('focus', handleFocus);

    return () => {
      usernameInput.removeEventListener('input', handleInput);
      usernameInput.removeEventListener('focus', handleFocus);
      if (typingTimeoutRef.current) {
        clearTimeout(typingTimeoutRef.current);
      }
    };
  }, []);

  // Handle password input - cover eyes
  useEffect(() => {
    const passwordInput = passwordRef.current;
    if (!passwordInput) return;

    const handleFocus = () => {
      setIsClosed(true);
    };
    
    const handleBlur = () => {
      setIsClosed(false);
    };

    passwordInput.addEventListener('focus', handleFocus);
    passwordInput.addEventListener('blur', handleBlur);

    return () => {
      passwordInput.removeEventListener('focus', handleFocus);
      passwordInput.removeEventListener('blur', handleBlur);
    };
  }, []);

  const triggerSubmitAnimation = useCallback(() => {
    setIsSubmitting(true);
    setIsClosed(true);
    
    setTimeout(() => {
      setIsClosed(false);
    }, 300);
    
    setTimeout(() => {
      setIsSubmitting(false);
    }, 600);
  }, []);

  return {
    containerRef,
    usernameRef,
    passwordRef,
    isClosed,
    isSubmitting,
    isTyping,
    pupilPosition,
    triggerSubmitAnimation,
  };
}

// ============================================
// COMPONENT: CuteEye
// ============================================

interface CuteEyeProps {
  isClosed: boolean;
  pupilOffset: { x: number; y: number };
}

function CuteEye({ isClosed, pupilOffset }: CuteEyeProps) {
  const maxOffset = 6;
  const translateX = pupilOffset.x * maxOffset;
  const translateY = pupilOffset.y * maxOffset;

  return (
    <div className={`cute-eye ${isClosed ? 'closed' : ''}`}>
      {!isClosed && (
        <div 
          className="cute-iris"
          style={{ transform: `translate(${translateX}px, ${translateY}px)` }}
        >
          <div className="eye-shine" />
          <div className="eye-shine-small" />
        </div>
      )}
    </div>
  );
}

// ============================================
// COMPONENT: SpiderEye (Main Export)
// ============================================

export function SpiderEye({
  isClosed = false,
  size = 120,
  pupilPosition = { x: 0, y: 0 },
  isSubmitting = false,
  isTyping = false,
  className = '',
}: SpiderEyeProps) {


  return (
    <div 
      className={`spider-eye-wrapper ${className}`}
      style={{ '--eye-size': `${size}px` } as React.CSSProperties}
    >
      {/* Hanging thread */}
      <div className="spider-thread" />
      
      <div className="cute-spider">
        {/* Spider Body */}
        <div className={`spider-body ${isSubmitting ? 'submitting' : ''}`}>
          {/* Eyes */}
          <div className="spider-eyes">
            <CuteEye isClosed={isClosed} pupilOffset={pupilPosition} />
            <CuteEye isClosed={isClosed} pupilOffset={pupilPosition} />
          </div>
          {/* Cute Legs */}
          <div className="spider-legs">
            {[...Array(8)].map((_, i) => (
              <div key={i} className="spider-leg" />
            ))}
          </div>
        </div>
      </div>
    </div>
  );
}

export const Spider = () => {
  const { containerRef, pupilPosition, isClosed } = useSpiderEye();
  const [isLandingPage, setIsLandingPage] = useState(false);

  // Detect if on landing page
  useEffect(() => {
    const path = window.location.pathname;
    setIsLandingPage(path === '/');
    
    const handleRouteChange = () => {
      setIsLandingPage(window.location.pathname === '/');
    };

    window.addEventListener('popstate', handleRouteChange);
    return () => window.removeEventListener('popstate', handleRouteChange);
  }, []);

  const positionClass = isLandingPage ? 'spider-center' : 'spider-left';

  return (
    <div
      ref={containerRef}
      className={`spider-container ${positionClass}`}
    >
      <SpiderEye
        isClosed={isClosed}
        size={120}
        pupilPosition={pupilPosition}
      />
    </div>
  );
};

export default Spider;
