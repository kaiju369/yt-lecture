export interface ContentRect {
  left: number;
  top: number;
  width: number;
  height: number;
}

/**
 * Compute the actual visible video-content rectangle inside a container,
 * accounting for letterboxing / pillarboxing (contain fit).
 */
export function computeContentRect(
  containerWidth: number,
  containerHeight: number,
  aspectRatio: number,
): ContentRect {
  if (
    !containerWidth ||
    !containerHeight ||
    !Number.isFinite(aspectRatio) ||
    aspectRatio <= 0
  ) {
    return { left: 0, top: 0, width: containerWidth, height: containerHeight };
  }
  const containerAr = containerWidth / containerHeight;
  if (containerAr > aspectRatio) {
    const width = containerHeight * aspectRatio;
    return {
      left: (containerWidth - width) / 2,
      top: 0,
      width,
      height: containerHeight,
    };
  }
  const height = containerWidth / aspectRatio;
  return {
    left: 0,
    top: (containerHeight - height) / 2,
    width: containerWidth,
    height,
  };
}
