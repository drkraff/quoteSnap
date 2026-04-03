import { useEffect, useRef } from 'react';
import { View, Animated, StyleSheet } from 'react-native';
import { colors, spacing } from '../../theme/tokens';

interface RecordingWaveformProps {
  isRecording: boolean;
}

const BAR_HEIGHTS = [20, 32, 24, 36, 20];
const ANIMATION_DURATION = 300;

export function RecordingWaveform({ isRecording }: RecordingWaveformProps): JSX.Element {
  const animations = useRef(BAR_HEIGHTS.map(() => new Animated.Value(0.3))).current;
  const loopRef = useRef<Animated.CompositeAnimation | null>(null);

  useEffect(() => {
    if (isRecording) {
      const animationSequences = animations.map((anim, index) =>
        Animated.loop(
          Animated.sequence([
            Animated.delay(index * 80),
            Animated.timing(anim, {
              toValue: 1.0,
              duration: ANIMATION_DURATION,
              useNativeDriver: true,
            }),
            Animated.timing(anim, {
              toValue: 0.3,
              duration: ANIMATION_DURATION,
              useNativeDriver: true,
            }),
          ]),
        ),
      );

      loopRef.current = Animated.parallel(animationSequences);
      loopRef.current.start();
    } else {
      if (loopRef.current) {
        loopRef.current.stop();
        loopRef.current = null;
      }
      animations.forEach((anim) => {
        anim.setValue(0.3);
      });
    }

    return () => {
      if (loopRef.current) {
        loopRef.current.stop();
        loopRef.current = null;
      }
    };
  }, [isRecording, animations]);

  return (
    <View
      style={styles.container}
      accessibilityElementsHidden={true}
      importantForAccessibility="no-hide-descendants"
    >
      {BAR_HEIGHTS.map((height, index) => (
        <Animated.View
          key={index}
          style={[
            styles.bar,
            {
              height,
              transform: [{ scaleY: animations[index] }],
            },
          ]}
        />
      ))}
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    height: 48,
    gap: spacing.xs,
  },
  bar: {
    width: spacing.xs,
    backgroundColor: colors.accent,
    borderRadius: 2,
  },
});
