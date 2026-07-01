import * as React from 'react';
interface StageProps {
    rootRef: React.RefObject<HTMLElement | null>;
    size: {
        width: number;
        height: number;
        dpr: number;
    };
    input: {
        x: number;
        y: number;
        active: boolean;
    };
    seed: number;
    reducedMotion: boolean;
    screenshots: string[];
    cardCount: number;
    stackOffsetX: number;
    stackOffsetY: number;
    stackOffsetZ: number;
    cardSize: number;
    groupOffsetX: number;
    groupOffsetY: number;
    cardCornerRadius: number;
    flipCycle: boolean;
    cycleInterval: number;
    fanDistance: number;
    fanRotation: number;
    springStiffness: number;
    springDamping: number;
    cursorTilt: number;
    ambientFloat: number;
    edgeGlowColor: string;
    edgeGlowStrength: number;
    shadowStrength: number;
    keyColor: string;
    fillColor: string;
    screenBrightness: number;
}
export default function StackStage(props: StageProps): import("react/jsx-runtime").JSX.Element;
export {};
