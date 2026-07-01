import * as React from 'react';
import CrazyGLWrapper, {
	useContent,
	useHeroReady,
	type HeroComponentProps,
} from '@crazygl/core';
import metadata from './metadata.json';
import './style.css';

const ContactSheetStage = React.lazy(() => import('./ContactSheetStage'));

type ContentAlign = 'start' | 'center' | 'end';

function CinematicContactSheetHero(props: HeroComponentProps) {
	const {
		size,
		input,
		seed,
		reducedMotion,
		rootRef,
		// Screenshots
		screenshot1 = 'https://crazygl.com/samples/nature1.avif',
		screenshot2 = 'https://crazygl.com/samples/nature2.avif',
		screenshot3 = 'https://crazygl.com/samples/nature3.avif',
		screenshot4 = 'https://crazygl.com/samples/nature4.avif',
		screenshot5 = 'https://crazygl.com/samples/nature5.avif',
		cardCount = 5,
		stackOffsetX = 0.035,
		stackOffsetY = 0.055,
		stackOffsetZ = 0.05,
		cardSize = 2.26,
		groupOffsetX = 0.55,
		groupOffsetY = -0.08,
		cardCornerRadius = 0.035,
		flipCycle = true,
		cycleInterval = 2.9,
		fanDistance = 0.1,
		fanRotation = 0.02,
		springStiffness = 180,
		springDamping = 14,
		cursorTilt = 0.45,
		ambientFloat = 0.26,
		edgeGlowColor = '#ffb364',
		edgeGlowStrength = 0.22,
		shadowStrength = 0.42,
		keyColor = '#ffe7cc',
		fillColor = '#c7bfff',
		screenBrightness = 0.32,
		contentAlign = 'start' as ContentAlign,
		paddingX = 64,
		paddingY = 48,
		bgTop = '#231918',
		bgBottom = '#090607',
	} = props as any;

	const content = useContent(props);
	useHeroReady(props);
	const [mounted, setMounted] = React.useState(false);
	React.useEffect(() => setMounted(true), []);

	const align: React.CSSProperties =
		contentAlign === 'end'
			? { justifyContent: 'flex-end', textAlign: 'right' }
			: contentAlign === 'center'
				? { justifyContent: 'center', textAlign: 'center' }
				: { justifyContent: 'flex-start', textAlign: 'left' };

	const screenshots = React.useMemo(
		() => [screenshot1, screenshot2, screenshot3, screenshot4, screenshot5],
		[screenshot1, screenshot2, screenshot3, screenshot4, screenshot5],
	);

	return (
		<>
			<crazygl-stage
				style={
					{
						position: 'absolute',
						inset: 0,
						zIndex: 0,
						overflow: 'hidden',
						background: `linear-gradient(180deg, ${bgTop} 0%, ${bgBottom} 100%)`,
					} as React.CSSProperties
				}
			>
				{mounted ? (
					<React.Suspense fallback={null}>
						<ContactSheetStage
							rootRef={rootRef}
							size={size}
							input={input}
							seed={seed}
							reducedMotion={reducedMotion}
							screenshots={screenshots}
							cardCount={cardCount}
							stackOffsetX={stackOffsetX}
							stackOffsetY={stackOffsetY}
							stackOffsetZ={stackOffsetZ}
							cardSize={cardSize}
							groupOffsetX={groupOffsetX}
							groupOffsetY={groupOffsetY}
							cardCornerRadius={cardCornerRadius}
							flipCycle={flipCycle}
							cycleInterval={cycleInterval}
							fanDistance={fanDistance}
							fanRotation={fanRotation}
							springStiffness={springStiffness}
							springDamping={springDamping}
							cursorTilt={cursorTilt}
							ambientFloat={ambientFloat}
							edgeGlowColor={edgeGlowColor}
							edgeGlowStrength={edgeGlowStrength}
							shadowStrength={shadowStrength}
							keyColor={keyColor}
							fillColor={fillColor}
							screenBrightness={screenBrightness}
						/>
					</React.Suspense>
				) : null}
			</crazygl-stage>
			<crazygl-content
				style={
					{
						position: 'absolute',
						inset: 0,
						display: 'flex',
						alignItems: 'center',
						zIndex: 1,
						pointerEvents: 'none',
						padding: `${paddingY}px ${paddingX}px`,
						...align,
					} as React.CSSProperties
				}
			>
				<div className="crazygl-cs-content">{content.node}</div>
			</crazygl-content>
		</>
	);
}

export { metadata };
export default function CinematicContactSheet(props: any) {
	return <CrazyGLWrapper hero={CinematicContactSheetHero} metadata={metadata as any} {...props} />;
}
