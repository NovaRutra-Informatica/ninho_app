import Foundation
import AVFAudio
import NinhoCore

@MainActor final class StudySoundPlayer {
    private var player: AVAudioPlayer?
    private var cache: [SoundCue: Data] = [:]

    /// Ambient audio mixes with music and obeys the iPhone's Silent mode. No
    /// microphone, background playback capability, or session activation at launch.
    func play(_ cue: SoundCue, enabled: Bool) {
        guard enabled else { stop(); return }
        let session = AVAudioSession.sharedInstance()
        // Do not change an AVKit lecture/call's existing playback configuration.
        guard session.category == .ambient || session.category == .soloAmbient else { return }
        do {
            try session.setCategory(.ambient, mode: .default)
            try session.setActive(true)
            let data = cache[cue] ?? StudySounds.waveData(for: cue)
            cache[cue] = data
            player?.stop()
            let next = try AVAudioPlayer(data: data)
            next.volume = 0.42
            next.prepareToPlay()
            player = next
            next.play()
        } catch {
            // Audio is optional. A failed cue must not turn a successful study
            // action into an error or interrupt reading/video playback.
            player = nil
        }
    }

    func stop() {
        player?.stop()
        player = nil
        // AVAudioSession is shared with AVKit; do not deactivate another player.
    }
}
