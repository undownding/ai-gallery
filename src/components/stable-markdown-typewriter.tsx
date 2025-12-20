"use client";

import ReactMarkdown from "react-markdown";
import { isValidElement, useEffect, useMemo, useRef, useState, type CSSProperties, type ReactNode } from "react";
import type { HTMLMotionProps } from "motion/react";
import type { MarkdownTypewriterProps } from "react-markdown-typewriter";

type StableMarkdownTypewriterProps = Omit<MarkdownTypewriterProps, "children"> & {
	children?: ReactNode;
	stableKey?: string | number;
};

function extractText(node: ReactNode): string {
	if (node === null || node === undefined || typeof node === "boolean") {
		return "";
	}
	if (typeof node === "string" || typeof node === "number") {
		return String(node);
	}
	if (Array.isArray(node)) {
		return node.map((child) => extractText(child as ReactNode)).join("");
	}
	if (isValidElement<{ children?: ReactNode }>(node)) {
		return extractText(node.props.children ?? "");
	}
	return "";
}

function resolveMotionStyle(style?: HTMLMotionProps<"span">["style"]): CSSProperties | undefined {
	if (!style) return undefined;
	return Object.entries(style).reduce<CSSProperties>((acc, [key, value]) => {
		if (value === null || value === undefined) return acc;
		const resolvedValue =
			typeof value === "object" && "get" in (value as { get?: () => unknown }) && typeof (value as { get?: () => unknown }).get === "function"
				? (value as { get: () => unknown }).get()
				: value;
		(acc as Record<string, unknown>)[key] = resolvedValue as CSSProperties[keyof CSSProperties];
		return acc;
	}, {});
}

function useTypingWindow(text: string, delay: number, sessionKey: string | number) {
	const [visibleLength, setVisibleLength] = useState(0);
	const previousTextRef = useRef<string>(text);
	const previousKeyRef = useRef<string | number>(sessionKey);
	const safeDelay = Number.isFinite(delay) && delay > 0 ? delay : 10;

	useEffect(() => {
		const previousText = previousTextRef.current;
		const keyChanged = previousKeyRef.current !== sessionKey;
		const hasAppend = !keyChanged && previousText.length > 0 && text.startsWith(previousText);
		if (keyChanged || (!hasAppend && text !== previousText)) {
			setVisibleLength(0);
		}
		previousTextRef.current = text;
		previousKeyRef.current = sessionKey;
	}, [text, sessionKey]);

	useEffect(() => {
		setVisibleLength((current) => Math.min(current, text.length));
	}, [text.length]);

	useEffect(() => {
		if (visibleLength >= text.length) return;
		const interval = window.setInterval(() => {
			setVisibleLength((current) => {
				if (current >= text.length) {
					return current;
				}
				const remaining = text.length - current;
				const step = Math.max(1, Math.floor(remaining / 24));
				return Math.min(text.length, current + step);
			});
		}, safeDelay);
		return () => clearInterval(interval);
	}, [safeDelay, text, visibleLength]);

	return text.slice(0, visibleLength);
}

/**
 * Streams markdown characters without resetting previously revealed text when the caller rerenders
 * with the full narration buffer.
 */
export function StableMarkdownTypewriter({
	stableKey = "markdown-typewriter",
	motionProps,
	delay = 10,
	children,
	...markdownProps
}: StableMarkdownTypewriterProps) {
	const targetText = useMemo(() => extractText(children), [children]);
	const renderedText = useTypingWindow(targetText, delay, stableKey);
	const className = motionProps?.className;
	const style = resolveMotionStyle(motionProps?.style);
	const containerRef = useRef<HTMLDivElement>(null);
	const enhancedStyle = useMemo(() => {
		return {
			...style,
			overflowY: style?.overflowY ?? "auto",
			scrollbarWidth: "none",
			msOverflowStyle: "none",
		} satisfies CSSProperties;
	}, [style]);

	useEffect(() => {
		const container = containerRef.current;
		if (!container) return;
		container.scrollTop = container.scrollHeight;
	}, [renderedText]);

	return (
		<>
			<div
				key={stableKey}
				ref={containerRef}
				className={className}
				style={enhancedStyle}
				data-typewriter-key={stableKey}
				data-typewriter-scroll-container
			>
				<ReactMarkdown {...markdownProps}>{renderedText}</ReactMarkdown>
			</div>
			<style jsx>{`
				[data-typewriter-scroll-container] {
					scrollbar-width: none;
					-ms-overflow-style: none;
				}
				[data-typewriter-scroll-container]::-webkit-scrollbar {
					display: none;
				}
			`}</style>
		</>
	);
}
