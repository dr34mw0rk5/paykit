"use client";

import { Maximize2, Minimize2, X } from "lucide-react";
import { useCallback, useEffect, useRef, useState } from "react";

import { Button } from "@/components/ui/button";
import { cn } from "@/lib/utils";

const KONAMI = [
  "ArrowUp",
  "ArrowUp",
  "ArrowDown",
  "ArrowDown",
  "ArrowLeft",
  "ArrowRight",
  "ArrowLeft",
  "ArrowRight",
];
const COLS = 17;
const ROWS = 13;
const TICK_MS = 180;
const CELL_SIZE_DEFAULT = 18;
const CELL_SIZE_FULLSCREEN = 24;

type Dir = "up" | "down" | "left" | "right";

function useKonami(onMatch: () => void) {
  const idx = useRef(0);

  useEffect(() => {
    function handleKey(e: KeyboardEvent) {
      if (e.key === KONAMI[idx.current]) {
        idx.current += 1;
        if (idx.current === KONAMI.length) {
          idx.current = 0;
          onMatch();
        }
      } else {
        idx.current = 0;
      }
    }
    window.addEventListener("keydown", handleKey);
    return () => window.removeEventListener("keydown", handleKey);
  }, [onMatch]);
}

function randomCell(): [number, number] {
  return [Math.floor(Math.random() * COLS), Math.floor(Math.random() * ROWS)];
}

function useSnakeGame() {
  const [snake, setSnake] = useState<[number, number][]>([
    [Math.floor(COLS / 2), Math.floor(ROWS / 2)],
  ]);
  const [food, setFood] = useState<[number, number]>(() => randomCell());
  const [dead, setDead] = useState(false);
  const [score, setScore] = useState(0);
  const nextDir = useRef<Dir>("right");

  const reset = useCallback(() => {
    setSnake([[Math.floor(COLS / 2), Math.floor(ROWS / 2)]]);
    setFood(randomCell());
    nextDir.current = "right";
    setDead(false);
    setScore(0);
  }, []);

  useEffect(() => {
    if (dead) return;

    const id = setInterval(() => {
      setSnake((body) => {
        const head = body[0];
        if (!head) return body;
        const d = nextDir.current;
        const dx = d === "left" ? -1 : d === "right" ? 1 : 0;
        const dy = d === "up" ? -1 : d === "down" ? 1 : 0;
        const nx = (head[0] + dx + COLS) % COLS;
        const ny = (head[1] + dy + ROWS) % ROWS;
        const newHead: [number, number] = [nx, ny];
        const hitSelf = body.some((s) => s[0] === nx && s[1] === ny);
        if (hitSelf) {
          setDead(true);
          return body;
        }
        const eat = food[0] === nx && food[1] === ny;
        if (eat) {
          setScore((s) => s + 1);
          setFood(randomCell());
          return [newHead, ...body];
        }
        return [newHead, ...body.slice(0, -1)];
      });
    }, TICK_MS);
    return () => clearInterval(id);
  }, [dead, food]);

  useEffect(() => {
    if (dead) return;
    function handleKey(e: KeyboardEvent) {
      const key = e.key.toLowerCase();
      const code = e.code;

      if ((key === "arrowup" || key === "w" || code === "KeyW") && nextDir.current !== "down")
        nextDir.current = "up";
      else if ((key === "arrowdown" || key === "s" || code === "KeyS") && nextDir.current !== "up")
        nextDir.current = "down";
      else if (
        (key === "arrowleft" || key === "a" || code === "KeyA") &&
        nextDir.current !== "right"
      )
        nextDir.current = "left";
      else if (
        (key === "arrowright" || key === "d" || code === "KeyD") &&
        nextDir.current !== "left"
      )
        nextDir.current = "right";
    }
    window.addEventListener("keydown", handleKey);
    return () => window.removeEventListener("keydown", handleKey);
  }, [dead]);

  return { snake, food, dead, score, reset };
}

export function DocsNotFoundGame() {
  const [open, setOpen] = useState(false);
  const [fullscreen, setFullscreen] = useState(false);
  const { snake, food, dead, score, reset } = useSnakeGame();

  useKonami(useCallback(() => setOpen(true), []));

  const close = useCallback(() => {
    setOpen(false);
    setFullscreen(false);
    reset();
  }, [reset]);

  const toggleFullscreen = useCallback(() => {
    setFullscreen((prev) => !prev);
  }, []);

  useEffect(() => {
    if (!open) return;

    function handleEscape(e: KeyboardEvent) {
      if (e.key === "Escape") {
        close();
      }
    }

    window.addEventListener("keydown", handleEscape);
    return () => window.removeEventListener("keydown", handleEscape);
  }, [close, open]);

  if (!open) return null;

  const snakeSet = new Set(snake.map(([x, y]) => `${x},${y}`));
  const foodKey = `${food[0]},${food[1]}`;
  const cellSize = fullscreen ? CELL_SIZE_FULLSCREEN : CELL_SIZE_DEFAULT;
  const gridW = COLS * cellSize + 16;
  const gridH = ROWS * cellSize + 16;

  return (
    <div
      className="bg-background/95 supports-[backdrop-filter]:bg-background/80 fixed inset-0 z-50 flex items-center justify-center p-2 backdrop-blur"
      role="dialog"
      aria-modal="true"
      aria-label="Snake game"
    >
      <div
        className={cn(
          "bg-fd-card border-fd-border flex flex-col overflow-hidden rounded-2xl border shadow-xl transition-[width,height,max-width,max-height] duration-300",
          fullscreen
            ? "h-[calc(100dvh-1rem)] max-h-[calc(100dvh-1rem)] w-[min(calc(100vw-1rem),42rem)] max-w-[min(calc(100vw-1rem),42rem)]"
            : "max-h-[85dvh] w-full max-w-[380px]",
        )}
      >
        <div className="bg-fd-muted/80 border-fd-border flex shrink-0 items-center justify-between gap-2 border-b px-3 py-2">
          <div className="flex items-center gap-2">
            <span className="bg-fd-muted text-fd-muted-foreground rounded-md px-2 py-0.5 font-mono text-[10px] tracking-wider uppercase">
              Snake
            </span>
            <span className="text-fd-muted-foreground text-xs font-medium">Score: {score}</span>
          </div>
          <div className="flex items-center gap-1">
            <Button
              variant="ghost"
              size="icon"
              className="size-7"
              onClick={toggleFullscreen}
              aria-label={fullscreen ? "Exit full screen" : "Full screen"}
            >
              {fullscreen ? <Minimize2 className="size-3.5" /> : <Maximize2 className="size-3.5" />}
            </Button>
            <Button
              variant="ghost"
              size="icon"
              className="size-7"
              onClick={close}
              aria-label="Close game"
            >
              <X className="size-3.5" />
            </Button>
          </div>
        </div>

        <div className="bg-fd-muted/40 border-fd-border flex min-h-0 flex-1 flex-col items-center justify-center gap-0 border-t p-4">
          <div className="bg-fd-muted/60 border-fd-border flex flex-col items-center justify-center rounded-xl border-2 p-3 shadow-inner">
            <div
              className="docs-crt-screen bg-background border-fd-border relative flex cursor-pointer items-center justify-center overflow-hidden rounded-lg border shadow-inner transition-opacity hover:opacity-95 active:opacity-90"
              style={{ minWidth: gridW, minHeight: gridH }}
              onClick={toggleFullscreen}
              onKeyDown={(e) => e.key === "Enter" && toggleFullscreen()}
              role="button"
              tabIndex={0}
              title="Click to expand"
              aria-label="Game screen; click to expand or shrink"
            >
              <div
                className="pointer-events-none absolute inset-0 flex items-center justify-center select-none"
                aria-hidden="true"
              >
                <svg
                  viewBox="0 0 513 577"
                  fill="none"
                  xmlns="http://www.w3.org/2000/svg"
                  className={cn(
                    "block h-36 w-auto shrink-0 scale-x-[1] scale-y-[1] fill-foreground opacity-5",
                  )}
                >
                  <path
                    d="M117.86 237.013C117.861 236.244 118.694 235.763 119.36 236.148L231.344 300.798C234.438 302.584 236.344 305.885 236.344 309.458L236.348 576.588L117.86 508.178V501.828C117.86 498.85 117.859 495.26 117.859 491.214C117.859 479.26 117.859 463.322 117.859 447.385C117.86 415.587 117.86 383.787 117.86 383.632V237.013Z"
                    fill="currentColor"
                  />
                  <path
                    d="M243.844 3.34936C251.579 -1.11646 261.109 -1.11646 268.844 3.34936L500.188 136.916C507.922 141.382 512.688 149.635 512.688 158.566V425.699C512.687 434.63 507.922 442.884 500.188 447.349L276.348 576.583L276.347 486.681L424.821 400.961C431.009 397.388 434.826 390.784 434.826 383.632V200.642C434.826 193.473 430.994 186.877 424.821 183.313L266.349 91.8191L265.765 91.4949C259.885 88.3562 252.815 88.3496 246.924 91.4939L246.338 91.8191L87.8652 183.313C81.6757 186.887 77.8605 193.492 77.8604 200.642V418.166C77.8601 427.234 77.8595 437.31 77.8594 447.385C77.8592 460.731 77.8593 474.077 77.8594 485.084L12.5 447.349C4.76516 442.884 0.000152081 434.63 0 425.699V158.566C0 149.635 4.76517 141.382 12.5 136.916L243.844 3.34936Z"
                    fill="currentColor"
                  />
                  <path
                    d="M393.326 236.138C393.993 235.754 394.826 236.235 394.826 237.005V366.316C394.826 369.889 392.92 373.19 389.826 374.976L277.846 439.628C277.179 440.013 276.346 439.531 276.346 438.761L276.344 309.456C276.344 305.883 278.25 302.582 281.344 300.796L393.326 236.138Z"
                    fill="currentColor"
                  />
                  <path
                    d="M251.343 135.117C254.437 133.331 258.249 133.331 261.343 135.117L373.321 199.768C373.988 200.153 373.988 201.116 373.321 201.501L261.343 266.156C258.249 267.942 254.437 267.942 251.343 266.156L139.356 201.505C138.69 201.12 138.69 200.157 139.356 199.772L251.343 135.117Z"
                    fill="currentColor"
                  />
                </svg>
              </div>
              <div
                className="bg-fd-muted/20 relative z-10 grid gap-0 rounded-md p-1"
                style={{
                  gridTemplateColumns: `repeat(${COLS}, 1fr)`,
                  width: gridW - 8,
                  height: gridH - 8,
                }}
              >
                {Array.from({ length: ROWS * COLS }, (_, i) => {
                  const x = i % COLS;
                  const y = Math.floor(i / COLS);
                  const key = `${x},${y}`;
                  const isSnake = snakeSet.has(key);
                  const isFood = key === foodKey;
                  return (
                    <div
                      key={key}
                      className={cn(
                        "rounded-[2px] transition-colors",
                        isSnake && "bg-primary",
                        isFood && "bg-primary rounded-full",
                        !isSnake && !isFood && "bg-transparent",
                      )}
                      style={{ width: cellSize - 2, height: cellSize - 2 }}
                    />
                  );
                })}
              </div>
            </div>
          </div>
          <div className="mt-3 flex min-h-[4.5rem] flex-col items-center justify-center gap-2">
            {dead ? (
              <>
                <p className="text-fd-foreground text-sm font-medium">Game over</p>
                <div className="flex gap-2">
                  <Button size="sm" onClick={reset}>
                    Play again
                  </Button>
                  <Button size="sm" variant="outline" onClick={close}>
                    Close
                  </Button>
                </div>
              </>
            ) : (
              <p className="text-fd-muted-foreground text-xs">
                Use <kbd className="bg-fd-muted rounded px-1.5 py-0.5 font-mono text-[10px]">←</kbd>{" "}
                <kbd className="bg-fd-muted rounded px-1.5 py-0.5 font-mono text-[10px]">→</kbd>{" "}
                <kbd className="bg-fd-muted rounded px-1.5 py-0.5 font-mono text-[10px]">↑</kbd>{" "}
                <kbd className="bg-fd-muted rounded px-1.5 py-0.5 font-mono text-[10px]">↓</kbd> or{" "}
                <kbd className="bg-fd-muted rounded px-1.5 py-0.5 font-mono text-[10px]">
                  W A S D
                </kbd>{" "}
                to move
              </p>
            )}
          </div>
        </div>
      </div>
    </div>
  );
}
