(function () {
  'use strict';

  const SVG_NS = 'http://www.w3.org/2000/svg';
  const config = {
      name: "Rose Curve",
      tag: "r = a cos(kθ)",
      rotate: true,
      particleCount: 78,
      trailSpan: 0.32,
      durationMs: 5400,
      rotationDurationMs: 28000,
      pulseDurationMs: 4600,
      strokeWidth: 4.5,
      roseA: 9.2,
      roseABoost: 0.6,
      roseBreathBase: 0.72,
      roseBreathBoost: 0.28,
      roseK: 5,
      roseScale: 3.25,
      formula(config) {
          return [
              `r(t) = (${config.roseA.toFixed(1)} + ${config.roseABoost.toFixed(2)}s)(${config.roseBreathBase.toFixed(2)} + ${config.roseBreathBoost.toFixed(2)}s) cos(${Math.round(config.roseK)}t)`,
              `x(t) = 50 + cos t · r(t) · ${config.roseScale.toFixed(2)}`,
              `y(t) = 50 + sin t · r(t) · ${config.roseScale.toFixed(2)}`,
          ].join("\n");
      },
      point(progress, detailScale, config) {
          const t = progress * Math.PI * 2;
          const a = config.roseA + detailScale * config.roseABoost;
          const k = Math.round(config.roseK);
          const r = a * (config.roseBreathBase + detailScale * config.roseBreathBoost) * Math.cos(k * t);
          return {
              x: 50 + Math.cos(t) * r * config.roseScale,
              y: 50 + Math.sin(t) * r * config.roseScale,
          };
      },
  };

  let suckedContainer = null;
  let suckedAssets = [];
  
  const assetColors = [
      '#DC9C47', // gold
      '#d86b49', // peach
      '#7fba7a', // green
      '#b8d4ff', // blue
      '#ffffff'  // white
  ];

  function normalizeProgress(progress) {
      return ((progress % 1) + 1) % 1;
  }
  function getDetailScale(time) {
      const pulseProgress = (time % config.pulseDurationMs) / config.pulseDurationMs;
      const pulseAngle = pulseProgress * Math.PI * 2;
      return 0.52 + ((Math.sin(pulseAngle + 0.55) + 1) / 2) * 0.48;
  }
  function getRotation(time) {
      if (!config.rotate) return 0;
      return -((time % config.rotationDurationMs) / config.rotationDurationMs) * 360;
  }
  function buildPath(detailScale, steps = 480) {
      return Array.from({ length: steps + 1 }, (_, index) => {
          const point = config.point(index / steps, detailScale, config);
          return `${index === 0 ? 'M' : 'L'} ${point.x.toFixed(2)} ${point.y.toFixed(2)}`;
      }).join(' ');
  }
  function getParticle(index, progress, detailScale) {
      const tailOffset = index / (config.particleCount - 1);
      const point = config.point(normalizeProgress(progress - tailOffset * config.trailSpan), detailScale, config);
      const fade = Math.pow(1 - tailOffset, 0.56);
      return {
          x: point.x,
          y: point.y,
          radius: 0.9 + fade * 2.7,
          opacity: 0.04 + fade * 0.96,
      };
  }

  function spawnSuckedAsset() {
      if (!suckedContainer) {
          suckedContainer = document.querySelector('#sucked-assets');
          if (!suckedContainer) return;
      }
      const angle = Math.random() * Math.PI * 2;
      const startRadius = 75 + Math.random() * 20;
      const speed = 0.5 + Math.random() * 0.5; // Fly straight towards center
      const color = assetColors[Math.floor(Math.random() * assetColors.length)];
      const radius = 1.0 + Math.random() * 1.5; // Simple, lightweight particles
      
      const el = document.createElementNS(SVG_NS, 'circle');
      el.setAttribute('r', String(radius));
      el.setAttribute('fill', color);
      el.setAttribute('opacity', '0');
      suckedContainer.appendChild(el);

      suckedAssets.push({
          el,
          radius: startRadius,
          angle,
          speed
      });
  }

  function updateSuckedAssets() {
      // Lower density: 4% spawn rate, max 10 elements simultaneously
      if (Math.random() < 0.04 && suckedAssets.length < 10) {
          spawnSuckedAsset();
      }

      for (let i = suckedAssets.length - 1; i >= 0; i--) {
          const asset = suckedAssets[i];
          asset.radius -= asset.speed; // Straight line movement to center

          const x = 50 + Math.cos(asset.angle) * asset.radius;
          const y = 50 + Math.sin(asset.angle) * asset.radius;

          let opacity = 0;
          if (asset.radius > 70) {
              opacity = (95 - asset.radius) / 25;
          } else if (asset.radius > 15) {
              opacity = 0.8;
          } else {
              opacity = asset.radius / 15 * 0.8;
          }
          opacity = Math.max(0, Math.min(0.8, opacity));

          asset.el.setAttribute('cx', x.toFixed(2));
          asset.el.setAttribute('cy', y.toFixed(2));
          asset.el.setAttribute('opacity', opacity.toFixed(3));

          if (asset.radius <= 2) {
              asset.el.remove();
              suckedAssets.splice(i, 1);
          }
      }
  }

  let animId = null;

  window.initMathCurveLoader = function () {
      if (animId) {
          cancelAnimationFrame(animId);
          animId = null;
      }

      const group = document.querySelector('#group');
      const path = document.querySelector('#path');
      suckedContainer = document.querySelector('#sucked-assets');
      
      if (!group || !path) {
          return;
      }

      // Remove any existing circle elements inside group (particles)
      const circles = group.querySelectorAll('circle');
      circles.forEach(c => c.remove());

      // Reset suckedAssets
      suckedAssets.forEach(asset => {
          try { asset.el.remove(); } catch(e) {}
      });
      suckedAssets = [];

      path.setAttribute('stroke-width', String(config.strokeWidth));

      const particles = Array.from({ length: config.particleCount }, () => {
          const circle = document.createElementNS(SVG_NS, 'circle');
          circle.setAttribute('fill', 'currentColor');
          group.appendChild(circle);
          return circle;
      });

      const startedAt = performance.now();

      function render(now) {
          const currentGroup = document.querySelector('#group');
          const currentPath = document.querySelector('#path');
          if (!currentGroup || !currentPath) {
              animId = null;
              return;
          }

          const time = now - startedAt;
          const progress = (time % config.durationMs) / config.durationMs;
          const detailScale = getDetailScale(time);
          currentGroup.setAttribute('transform', `rotate(${getRotation(time)} 50 50)`);
          currentPath.setAttribute('d', buildPath(detailScale));
          particles.forEach((node, index) => {
              const particle = getParticle(index, progress, detailScale);
              node.setAttribute('cx', particle.x.toFixed(2));
              node.setAttribute('cy', particle.y.toFixed(2));
              node.setAttribute('r', particle.radius.toFixed(2));
              node.setAttribute('opacity', particle.opacity.toFixed(3));
          });
          
          updateSuckedAssets();
          
          animId = requestAnimationFrame(render);
      }

      animId = requestAnimationFrame(render);
  };

  // Run automatically if DOM is already ready
  if (document.querySelector('#group') && document.querySelector('#path')) {
      window.initMathCurveLoader();
  }

})();