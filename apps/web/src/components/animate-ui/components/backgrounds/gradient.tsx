'use client';

import * as React from 'react';
import { motion, type HTMLMotionProps } from 'motion/react';

import { cn } from '@/lib/utils';

type GradientBackgroundProps = HTMLMotionProps<'div'>;

function GradientBackground({
  className,
  transition = { duration: 20, ease: 'easeInOut', repeat: Infinity },
  ...props
}: GradientBackgroundProps) {
  return (
    <motion.div
      data-slot="gradient-background"
      className={cn(
        'size-full bg-[length:400%_400%]',
        // Light mode: clean neutral tones
        'bg-gradient-to-br from-[#FFFFFF] via-[#F5F3F0] to-[#FAFAFA]',
        // Dark mode: deep darks with subtle undertones
        'dark:from-[#1A1918] dark:via-[#24232E] dark:to-[#2C2B27]',
        className,
      )}
      animate={{ backgroundPosition: ['0% 50%', '100% 50%', '0% 50%'] }}
      transition={transition}
      {...props}
    />
  );
}

export { GradientBackground, type GradientBackgroundProps };
