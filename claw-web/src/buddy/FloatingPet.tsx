import { c as _c } from "react/compiler-runtime";
import React, { useEffect, useRef, useState } from 'react';
import { Box, Text } from '../ink.js';
import { useAppState, useSetAppState } from '../state/AppState.js';
import type { AppState } from '../state/AppStateStore.js';
import { feature } from 'bun:bundle';

const TICK_MS = 500;
const BUBBLE_SHOW = 20;
const FADE_WINDOW = 6;

const FLOATING_PET_PETS = {
  draco: { char: '🐲', name: '像素火龙 (Draco)', moods: { idle: '守护着这行代码...', happy: '代码优化完成，吐一口火庆祝！🔥', sad: '发生了语法错误！😠' } },
  kraken: { char: '🐙', name: '代码章鱼 (Kraken)', moods: { idle: '整理复杂的依赖关系...', happy: '嘿嘿，我发现了未定义的行为！🤯', sad: '这行代码看起来太乱了...墨水喷溅！🕶️' } },
  spirit: { char: '💫', name: '数据精灵 (Spirit)', moods: { idle: '在内存中寻找灵感...', happy: '逻辑完美！闪耀着光芒✨💖', sad: '被垃圾回收器追赶了...🏃' } },
  spider: { char: '🕷️', name: '除虫蜘蛛 (Spider)', moods: { idle: '在代码网格中编织...', happy: '捕获了一个 Bug！我把它挂在网上🕸️🧐', sad: '这个 Bug 隐藏得太深了...' } }
} as const;

type PetKey = keyof typeof FLOATING_PET_PETS;

function wrapText(text: string, width: number): string[] {
  const words = text.split(' ');
  const lines: string[] = [];
  let cur = '';
  for (const w of words) {
    if (cur.length + w.length + 1 > width && cur) {
      lines.push(cur);
      cur = w;
    } else {
      cur = cur ? `${cur} ${w}` : w;
    }
  }
  if (cur) lines.push(cur);
  return lines;
}

function FloatingBubble(t0: { text: string; fading: boolean; color: string }) {
  const $ = _c(8);
  const { text, fading, color } = t0;
  let t1;
  let t2;
  let t3;
  let t4;
  let t5;
  let t6;
  if ($[0] !== color || $[1] !== fading || $[2] !== text) {
    const lines = wrapText(text, 28);
    t1 = lines;
    t2 = color;
    t3 = fading;
    t4 = lines.length;
    $[0] = color;
    $[1] = fading;
    $[2] = text;
    $[3] = t1;
    $[4] = t2;
    $[5] = t3;
    $[6] = t4;
  } else {
    t1 = $[3];
    t2 = $[4];
    t3 = $[5];
    t4 = $[6];
  }
  let t7;
  if ($[7] !== t1 || $[8] !== t2 || $[9] !== t3) {
    t7 = (
      <Box flexDirection="column" borderStyle="round" borderColor={t2} paddingX={1} width={34}>
        {t1.map((l, i) => (
          <Text key={i} italic={true} dimColor={!!t3} color={t3 ? "inactive" : undefined}>{l}</Text>
        ))}
      </Box>
    );
    $[7] = t1;
    $[8] = t2;
    $[9] = t3;
    $[10] = t7;
  } else {
    t7 = $[10];
  }
  return t7;
}

export function FloatingPet(): React.ReactNode {
  const $ = _c(16);
  const [currentPetKey, setCurrentPetKey] = useState<PetKey>('draco');
  const [speechText, setSpeechText] = useState(FLOATING_PET_PETS.draco.moods.idle);
  const [tick, setTick] = useState(0);
  const lastSpokeTick = useRef(0);
  const setAppState = useSetAppState();
  const [isExpanded, setIsExpanded] = useState(false);

  useEffect(() => {
    if (!feature('BUDDY')) return;
    const timer = setInterval(() => setTick(t => t + 1), TICK_MS);
    return () => clearInterval(timer);
  }, []);

  useEffect(() => {
    if (!speechText) return;
    lastSpokeTick.current = tick;
    const timeout = setTimeout(() => {
      setSpeechText(FLOATING_PET_PETS[currentPetKey].moods.idle);
    }, BUBBLE_SHOW * TICK_MS);
    return () => clearTimeout(timeout);
  }, [speechText, currentPetKey, tick]);

  if (!feature('BUDDY')) return null;

  const petData = FLOATING_PET_PETS[currentPetKey];
  const bubbleAge = tick - lastSpokeTick.current;
  const fading = bubbleAge >= BUBBLE_SHOW - FADE_WINDOW;

  const handleInput = (input: string) => {
    const lowerInput = input.toLowerCase();
    let response: string;
    let emoji: string;

    if (lowerInput.includes('error') || lowerInput.includes('crash')) {
      emoji = '😱';
      response = petData.moods.sad;
    } else if (lowerInput.includes('love') || lowerInput.includes('cool') || lowerInput.includes('optimize')) {
      emoji = '🥰';
      response = petData.moods.happy;
    } else if (lowerInput.includes('clean') || lowerInput.includes('format')) {
      emoji = '✨';
      response = '代码格式化完成，焕然一新！';
    } else if (lowerInput.includes('bug')) {
      if (currentPetKey === 'spider') {
        emoji = '🕷️';
        response = '找到了！Bug 已经被我缠住了！🕸️';
      } else {
        emoji = '😨';
        response = '我不喜欢 Bug... 快清理掉！';
      }
    } else if (lowerInput.includes('code') || lowerInput.includes('script')) {
      if (currentPetKey === 'draco') {
        emoji = '🛡️';
        response = '我正在守护这行核心代码！';
      } else {
        emoji = '📝';
        response = '代码编写中...我正在给你灵感！';
      }
    } else {
      emoji = petData.char;
      response = `"${input}"？我不明白，但我大受震撼。`;
    }

    setSpeechText(response);
    setAppState((prev: AppState) => ({
      ...prev,
      companionReaction: response
    }));
  };

  const switchPet = (key: PetKey) => {
    setCurrentPetKey(key);
    setSpeechText(FLOATING_PET_PETS[key].moods.idle);
  };

  const frameCount = 3;
  const spriteFrame = tick % frameCount;
  const floatOffset = spriteFrame === 1 ? '↓' : spriteFrame === 2 ? '↑' : '';

  return (
    <Box flexDirection="column" alignItems="flex-start" flexShrink={0}>
      {speechText && (
        <Box marginBottom={1}>
          <FloatingBubble text={speechText} fading={fading} color="accent" />
        </Box>
      )}
      <Box flexDirection="row" alignItems="center" gap={1}>
        <Text bold color="accent">{petData.char}</Text>
        <Text dimColor={!isExpanded}>{petData.name}</Text>
        <Box flexDirection="column" gap={0}>
          <Text dimColor={true}>切换: </Text>
          {(Object.keys(FLOATING_PET_PETS) as PetKey[]).map(key => (
            <Text
              key={key}
              dimColor={currentPetKey !== key}
              onClick={() => switchPet(key)}
            >
              {FLOATING_PET_PETS[key].char}
            </Text>
          ))}
        </Box>
      </Box>
    </Box>
  );
}

export function FloatingPetBubble(): React.ReactNode {
  const $ = _c(8);
  const reaction = useAppState(_temp);
  let t0;
  if ($[0] !== reaction) {
    t0 = { tick: 0, forReaction: reaction };
    $[0] = reaction;
    $[1] = t0;
  } else {
    t0 = $[1];
  }
  const [t1, setTick] = useState(t0);
  const { tick, forReaction } = t1;
  if (reaction !== forReaction) {
    setTick({ tick: 0, forReaction: reaction });
  }
  let t2;
  let t3;
  if ($[2] !== reaction) {
    t2 = () => {
      if (!reaction) return;
      const timer = setInterval(_temp3, TICK_MS, setTick);
      return () => clearInterval(timer);
    };
    t3 = [reaction];
    $[2] = reaction;
    $[3] = t2;
    $[4] = t3;
  } else {
    t2 = $[3];
    t3 = $[4];
  }
  useEffect(t2, t3);
  if (!feature("BUDDY") || !reaction) return null;
  const t4 = tick >= BUBBLE_SHOW - FADE_WINDOW;
  let t5;
  if ($[5] !== reaction || $[6] !== t4) {
    t5 = <FloatingBubble text={reaction} fading={t4} color="accent" />;
    $[5] = reaction;
    $[6] = t4;
    $[7] = t5;
  } else {
    t5 = $[7];
  }
  return t5;
}

function _temp3(set) {
  return set(_temp2);
}
function _temp2(s_0) {
  return { ...s_0, tick: s_0.tick + 1 };
}
function _temp(s) {
  return s.companionReaction;
}
