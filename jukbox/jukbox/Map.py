import random
import matplotlib
import numpy as np
import math
import threading
from datetime import datetime
from obspy.clients.fdsn import Client
from obspy import UTCDateTime
from obspy.imaging.beachball import beachball
from obspy.clients.fdsn.header import FDSNNoDataException

from jukbox.Sample import Sample

class Map:
    def __init__(self):
        self.lat = 40.7128
        self.lon = -74.0060
        self.currentRadius = 100
        self.responseQueue = []
        self.dateRange = datetime(1945,1,1),datetime.now()
        self.approvedChannels = ["BHZ","MXZ"]
        self.approvedNetworks = ["IU", "II", "IC", "IM", "IR", "US", "CI", "NC", "PR", "AK"]
        self.lock = threading.Lock()
        self.stationSearchResults = {}

        self.selectedClient = "IRIS"
   
    def getEvents(self, lat, lon, maxRad, client="IRIS"):
        #print('called getEvents')
        #print(f"Client: {client}")
        client = Client(client)
        try:
            out = client.get_events(
                latitude=self.lat,
                longitude=self.lon,
                maxradius=maxRad,
                starttime=self.dateRange[0],
                endtime=self.dateRange[1],
                minmagnitude=self.minMag,
                includeallorigins=True,
                orderby="magnitude",
                limit=10
            )
            return out
        except Exception as e:
            print(f"Error fetching events: {e}")
            raise e
            return []

    def getStations(self, maxRad, attempt=1, maxAttempts=8) -> list:
        self.stationSearchResults = {}
        client = Client("IRIS")
        maxCount = 128
        threads = []
        if not self.responseQueue:
            print("getStations detected no events in response queue.")
            return {}
        try:
            bulkParams = []
            for currentEvent in self.responseQueue:
                start = currentEvent.get("starttime")
                end = currentEvent.get("endtime")
                nStr = ",".join(self.approvedNetworks)
                cStr = ",".join(self.approvedChannels)
                bulkParams.append(("*", "*", "*",cStr, start, end))


            stationList = client.get_stations_bulk(
                bulkParams,
                level="channel",
                latitude=self.lat,
                longitude=self.lon,
                maxradius=maxRad,
                includeavailability=True,
                matchtimeseries=True,
                includerestricted=False,
                nodata=204
            )

            for network in stationList:
                t = threading.Thread(
                    target=self.processNetwork,
                    args=(network, stationList, self.responseQueue, maxCount)
                )
                t.start()
                threads.append(t)

            for t in threads:
                t.join()

            if len(self.stationSearchResults) >= maxCount:
                #print(self.stationSearchResults)
                return self.stationSearchResults

        except FDSNNoDataException as e:
            print(f"No data found (204). Attempt {attempt}/{maxAttempts}")
            if attempt < maxAttempts:
                return self.getStations(maxRad * 3, attempt + 1,maxAttempts)
            else:
                print("Max retry attempts reached.")
                return {}

        except Exception as e:
            print(f"Error in getStations: {e}")
            return {}



    def processNetwork(self, network, stationList, events, maxCount):

        #self.stationSearchResults.
        for station in network:
            if not station.channels:
                continue
            for event in events:
                stationsForEvent = 0
                starttime = event.get('starttime')
                endtime = event.get('endtime')
                for channel in station.channels:
                    if stationsForEvent > 1:
                        break
                    if channel.code not in self.approvedChannels:
                        print(f"Skipping channel {channel.code} in station {station.code} of network {network.code}")
                        continue

                    if channel.start_date and channel.start_date > endtime:
                        continue
                    if channel.end_date and channel.end_date < starttime:
                        continue

                    seedId = f"{network.code}.{station.code}.{channel.location_code}.{channel.code}"
                    try:
                        coords = stationList.get_coordinates(seedId, starttime)
                        latitude = coords.get("latitude")
                        longitude = coords.get("longitude")
                        elev = coords.get("elevation")
                        depth = coords.get("local_depth")

                        with self.lock:
                            if len(self.stationSearchResults) < maxCount and seedId not in self.stationSearchResults:
                                stationsForEvent += 1
                                self.stationSearchResults[seedId] = {
                                    'eventId': event.get('id'),
                                    'lat': latitude,
                                    'lon': longitude,
                                    'elev': elev,
                                    'depth': depth,
                                    'starttime': starttime.isoformat(),
                                    'endtime': endtime.isoformat()
                                }
                        break  # once matched and saved, break out of time window loop
                    except Exception as e:
                        print(f"Error getting coordinates for {seedId} during window {starttime}–{endtime}: {e}")

    def eventSearch(self):
        try:
            events = self.getEvents(self.lat, self.lon, self.currentRadius / 111.111, self.selectedClient)
            if not events:
                print("No earthquakes found in this area!") 
            #eventStations = []

            if self.selectedClient != "USGS":
                for event in events:
                    origin = event.preferred_origin()
                    if origin is None:
                        print("No origin available for this event.") 
                        events.remove(event)
                        continue
                    
                    #eventStations = self.getStations(event,self.lat, self.lon, self.currentRadius / 111.111, 0, 8)
                    #if eventStations is None or len(eventStations) == 0:
                        #print("No stations found in this area!") 
                        #continue


                    mechanism = event.preferred_focal_mechanism()
                    if not mechanism and event.focal_mechanisms:
                        mechanism = event.focal_mechanisms[0]

                    mag = event.preferred_magnitude().mag if event.preferred_magnitude() else None
                    type = str(event.event_type) if event.event_type else "event"
                    starttime = event.origins[0].time - 5 * 60
                    endtime = event.origins[0].time + 1800
                    response = {
                        'id': random.randint(100000, 999999),
                        'lat': origin.latitude,
                        'lon': origin.longitude,
                        'starttime':starttime,
                        'endtime':endtime,  # Convert to ISO format
                        ##"depth": origin.depth / 1000,  # Convert to km
                        "mag": mag,
                        "type": type
                    } 
                    self.responseQueue.append(response)
            else:
                try:
                    eventCount = 0
                    for event in events:
                        if event.origins == None or len(event.origins) == 0:
                            print("No origin available for this event.") 
                            continue
                        origin = event.preferred_origin()
                        mechanism = event.preferred_focal_mechanism()
                        if not mechanism and event.focal_mechanisms:
                            mechanism = event.focal_mechanisms[0]
                        if not mechanism or not mechanism.moment_tensor:
                            print("No moment tensor available for this event.") 
                            continue
                        tensor = mechanism.moment_tensor.tensor
                        components = [
                            tensor.m_rr, tensor.m_tt, tensor.m_pp,
                            tensor.m_rt, tensor.m_rp, tensor.m_tp
                        ]
                        if any(x is None for x in components):
                            print("Incomplete moment tensor components.")
                            continue

                        ballPath = f"./assets/img/beachballTmp/beachball{str(eventCount)}.png"
                        newBall = beachball(components, size=50, facecolor=self.magToColor(event.preferred_magnitude().mag), outfile=ballPath)
                        matplotlib.pyplot.close(newBall)

                        # Your logic for marker creation here
                        mechanism = event.preferred_focal_mechanism()
                        if not mechanism and event.focal_mechanisms:
                            mechanism = event.focal_mechanisms[0]
                        if not mechanism or not mechanism.moment_tensor:
                            print("No moment tensor available for this event.") 
                            #mechanism = None
                            continue

                        # Your logic for marker creation here
                        mag = event.preferred_magnitude().mag if event.preferred_magnitude() else None
                        type = str(event.event_type) if event.event_type else "event"


                        response = {
                            'lat': origin.latitude,
                            'lon': origin.logitude,
                            'starttime': event.origins[0].time - 5 * 60,  # Convert to ISO format
                            'endtime': event.origins[0].time + 1800,  # Convert to ISO format
                            "depth": origin.depth / 1000,  # Convert to km
                            "mag": mag,
                            "type": type
                        }
                        eventCount += 1
                        self.responseQueue.append(response)
                except Exception as e:
                    raise e
            stations = self.getStations(self.currentRadius / 111.111)
            ret = {
                'events': self.responseQueue,
                'stations': stations,
                'data':formatWaveforms(self.fetchWaveforms(stations))
            }
            return ret
        except Exception as e:
            print(f"Event search error: {e}")
            raise e


    def magToEnergy(self, mag):
        return math.pow(10, ((mag * 3) / 2) + 4.8)

    def magToColor(self, mag):
        minEnergy = self.magToEnergy(3.5)
        maxEnergy = self.magToEnergy(9.5)
        norm = (np.log10(self.magToEnergy(mag)) - np.log10(minEnergy)) / (np.log10(maxEnergy) - np.log10(minEnergy))
        norm = np.clip(norm, 0.0, 1.0)
        red = 1.0 - norm
        green = 0.5
        blue = norm
        return (red, green, blue)





    def fetchWaveforms(self,stations):
        client = Client("IRIS")
        try:
            bulk = []
            for s in stations:
                for r in self.responseQueue:
                    try:
                        network_code, station_code, location_code, channel_code = s.split(".")
                        bulk.append((network_code, station_code, location_code, channel_code, r.get('starttime'), r.get('endtime')))
                    except Exception as e:
                        print(f"Failed to build bulk item for {s}: {e}")

            st = client.get_waveforms_bulk(bulk, attach_response=True)
            if st is None or len(st) == 0:
                print("No waveforms found for the selected stations.")
                return
            return st
        except Exception as e:
            print(f"Error fetching waveforms: {e}")


def formatWaveforms(stream):
    waveforms = []
    
    for trace in stream:
        time = trace.times()  # this gives the time values
        amplitude = trace.data  # this gives the amplitude values
        
        waveform = {
            'time': time.tolist(),   # Convert numpy array to list
            'amplitude': amplitude.tolist(),  # Convert numpy array to list
            'station': trace.stats.station,  # Optional, station name
            'network': trace.stats.network,  # Optional, network name
            'starttime': trace.stats.starttime.isoformat(),  # Start time in ISO format
            'sampling_rate': trace.stats.sampling_rate  # Sampling rate
        }
        waveforms.append(waveform)
    
    return waveforms