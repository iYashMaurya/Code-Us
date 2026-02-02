import React, { useEffect, useRef } from 'react';

export default function Starfield({ frozen = false }) {
  const canvasRef = useRef(null);
  const starsRef = useRef([]);
  const shipsRef = useRef([]);
  const animationRef = useRef(null);

  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;

    const ctx = canvas.getContext('2d');
    const setCanvasSize = () => {
      canvas.width = window.innerWidth;
      canvas.height = window.innerHeight;
    };
    setCanvasSize();
    window.addEventListener('resize', setCanvasSize);

    // Initialize stars with different layers for parallax
    if (starsRef.current.length === 0) {
      for (let i = 0; i < 200; i++) {
        starsRef.current.push({
          x: Math.random() * canvas.width,
          y: Math.random() * canvas.height,
          size: Math.random() * 2 + 1,
          speed: Math.random() * 0.5 + 0.1,
          opacity: Math.random() * 0.5 + 0.5,
          twinkle: Math.random() * Math.PI * 2,
        });
      }

      // Add floating pixel ships/satellites
      for (let i = 0; i < 5; i++) {
        shipsRef.current.push({
          x: Math.random() * canvas.width,
          y: Math.random() * canvas.height,
          type: Math.floor(Math.random() * 3), // 0: satellite, 1: ship, 2: asteroid
          speed: Math.random() * 0.3 + 0.1,
          angle: Math.random() * Math.PI * 2,
        });
      }
    }

    const drawPixelStar = (x, y, size) => {
      const pixelSize = Math.max(1, Math.floor(size));
      ctx.fillRect(Math.floor(x), Math.floor(y), pixelSize, pixelSize);
    };

    const drawPixelShip = (x, y, type) => {
      const patterns = [
        // Satellite
        [
          [0, 1, 1, 0],
          [1, 1, 1, 1],
          [1, 1, 1, 1],
          [0, 1, 1, 0],
        ],
        // Ship
        [
          [0, 0, 1, 0, 0],
          [0, 1, 1, 1, 0],
          [1, 1, 1, 1, 1],
          [0, 1, 0, 1, 0],
        ],
        // Asteroid
        [
          [0, 1, 1, 0],
          [1, 1, 1, 1],
          [1, 1, 1, 0],
          [0, 1, 1, 1],
        ],
      ];

      const pattern = patterns[type] || patterns[0];
      const colors = ['#888', '#5eb5d4', '#666'];
      ctx.fillStyle = colors[type];

      pattern.forEach((row, ry) => {
        row.forEach((pixel, rx) => {
          if (pixel) {
            ctx.fillRect(Math.floor(x + rx * 2), Math.floor(y + ry * 2), 2, 2);
          }
        });
      });
    };

    const animate = () => {
      if (!frozen) {
        ctx.fillStyle = '#050508';
        ctx.fillRect(0, 0, canvas.width, canvas.height);

        // Draw and update stars
        starsRef.current.forEach((star) => {
          star.twinkle += 0.05;
          const twinkleOpacity = Math.sin(star.twinkle) * 0.2 + star.opacity;
          ctx.fillStyle = `rgba(255, 255, 255, ${twinkleOpacity})`;
          drawPixelStar(star.x, star.y, star.size);

          // Move stars slowly downward for parallax
          star.y += star.speed;
          if (star.y > canvas.height) {
            star.y = 0;
            star.x = Math.random() * canvas.width;
          }
        });

        // Draw and update ships/satellites
        shipsRef.current.forEach((ship) => {
          drawPixelShip(ship.x, ship.y, ship.type);

          // Move diagonally
          ship.x += Math.cos(ship.angle) * ship.speed;
          ship.y += Math.sin(ship.angle) * ship.speed;

          // Wrap around screen
          if (ship.x > canvas.width) ship.x = -20;
          if (ship.x < -20) ship.x = canvas.width;
          if (ship.y > canvas.height) ship.y = -20;
          if (ship.y < -20) ship.y = canvas.height;
        });
      }

      animationRef.current = requestAnimationFrame(animate);
    };

    animate();

    return () => {
      window.removeEventListener('resize', setCanvasSize);
      if (animationRef.current) {
        cancelAnimationFrame(animationRef.current);
      }
    };
  }, [frozen]);

  return (
    <canvas
      ref={canvasRef}
      className="fixed inset-0 -z-10"
      style={{ imageRendering: 'pixelated' }}
    />
  );
}