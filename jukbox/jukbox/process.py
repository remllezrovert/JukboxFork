import matplotlib.pyplot as plt
import obspy

def generate_spectrogram(filePath):
    st = obspy.read(filePath)

    if not st:
        print("No data loaded!")
        return

    print(f"Data loaded, number of traces: {len(st)}")

    # st.filter(type='highpass', freq=3.0)
    # st.filter(type='bandpass', freqmin=15.0, freqmax=40.0)
    # st.filter(type='lowpass', freq=3.0)

    st = st.select(component='Z')

    if not st:
        print("No data after filtering or selecting the Z component!")
        return

    print(f"Data after filtering and selecting 'Z' component, number of traces: {len(st)}")

    trace = st[0]

    print(f"Time range: {trace.stats.starttime} to {trace.stats.endtime}")
    print(f"Number of data points: {len(trace)}")

    plt.figure(figsize=(10, 6))
    plt.specgram(trace.data, Fs=trace.stats.sampling_rate, NFFT=1024, noverlap=512, scale='dB', sides='default', cmap='magma')
    plt.title(filePath.split('/')[-1])
    plt.xlabel("Time (s)")
    plt.ylabel("Frequency (Hz)")

    plt.xlim(1, 1000)
    plt.ylim(1, 40)
    filePath.split('/')
    plt.savefig(f"media/images/{filePath.split('/')[-1]}.png", format='png')
    plt.close()

if __name__ == "__main__":
    print("Don't run this directly. or edit the path")
    ##generate_spectrogram("../media/uploads/03042025.mseed")
