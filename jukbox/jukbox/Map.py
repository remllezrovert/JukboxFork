import os
import json
import random
import traceback
import copy
import matplotlib
import numpy as np
import math
import threading
import heapq
from datetime import datetime, timedelta
from obspy.clients.fdsn import Client
from obspy import UTCDateTime
from obspy.imaging.beachball import beachball
from obspy.clients.fdsn.header import FDSNNoDataException
from apscheduler.schedulers.background import BackgroundScheduler

from jukbox.Sample import Sample


class kClosest():
    def __init__(self, eventId, num):
        self.eventId = eventId
        self.num = num
        self.arr = []

    def __len__(self):
        return len(self.arr)

    def __getitem__(self, index):
        if index < 0 or index >= len(self.arr):
            raise IndexError("Index out of range")
        return self.arr[index][1]

    def __str__(self):
        return str(self.arr)

    def append(self, item):
        distance = item.get('distance')
        wrapper = (-1 * distance, item)

        if len(self.arr) < self.num:
            heapq.heappush(self.arr, wrapper)
        else:
            if wrapper[0] < self.arr[0][0]:
                heapq.heappushpop(self.arr, wrapper)


class Map:
    def __init__(self):
        self.lat = 40.7128
        self.lon = -74.0060
        self.currentRadius = 100
        self.eventsById = {}
        self.dateRange = datetime(1945, 1, 1), datetime.now()
        self.approvedChannels = ["BHZ", "MXZ"]
        self.approvedNetworks = ["IU", "II", "IC", "IM", "IR", "US", "CI", "NC", "PR", "AK"]
        self.lock = threading.Lock()
        self.stationSearchResults = {}

        self.selectedClient = "IRIS"

        self.scheduler = BackgroundScheduler()
        self.scheduler.start()

    def getEvents(self, lat, lon, maxRad, client="IRIS"):
        #print('called getEvents')
        client = Client(client)
        try:
            out = client.get_events(
                latitude=lat,
                longitude=lon,
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
        if not self.eventsById:
            print("getStations detected no events in response queue.")
            return {}
        try:
            bulkParams = []
            for eventId, currentEvent in self.eventsById.items():
                self.stationSearchResults[eventId] = kClosest(eventId, 5)
                start = currentEvent.get("starttime")
                end = currentEvent.get("endtime")
                if not start or not end:
                    print(f"Skipping event {eventId} due to missing start or end time")
                    continue
                nStr = ",".join(self.approvedNetworks)
                cStr = ",".join(self.approvedChannels)
                bulkParams.append(("*", "*", "*", cStr, start, end))

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
                    args=(network, stationList, self.eventsById, maxCount)
                )
                t.start()
                threads.append(t)

            for t in threads:
                t.join()

            return self.stationSearchResults
        except FDSNNoDataException as e:
            print(f"No data found (204). Attempt {attempt}/{maxAttempts}")
            if attempt < maxAttempts:
                return self.getStations(maxRad * 2, attempt + 1, maxAttempts)
            else:
                print("Max retry attempts reached.")
                return {}

        except Exception as e:
            print(f"Error in getStations: {e}")
            traceback.print_exc()
            return {}

    def processNetwork(self, network, stationList, events, maxCount):
        for station in network:
            if not station.channels:
                continue
            for eventId, event in self.eventsById.items():
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
                        distance = getStationDistance(
                            {'lat': latitude, 'lon': longitude},
                            self.lat, self.lon
                        )
                        with self.lock:
                            stationsForEvent += 1
                            closestStations = self.stationSearchResults[eventId]
                            closestStations.append({
                                'seedId': seedId,
                                'icon': f"/static/jukbox/img/station.jpg",
                                'lat': latitude,
                                'lon': longitude,
                                'distance': distance,
                                'elev': elev,
                                'depth': depth,
                                'starttime': starttime.isoformat(),
                                'endtime': endtime.isoformat()
                            })
                        break
                    except Exception as e:
                        print(f"Error getting coordinates for {seedId} during window {starttime}–{endtime}: {e}")

    def eventSearch(self):
        try:
            print(f"Searching for events near ({self.lat}, {self.lon}) within {self.currentRadius}° radius.")
            events = self.getEvents(self.lat, self.lon, self.currentRadius, "USGS")
            print(events)
            icons = []
            if not events:
                print("No earthquakes found in this area!")
            if self.selectedClient != "USGS":
                for event in events:
                    eventId = random.randint(100000, 999999)
                    origin = event.preferred_origin()
                    if origin is None:
                        print("No origin available for this event.")
                        events.remove(event)
                        continue

                    mechanism = event.preferred_focal_mechanism()
                    if not mechanism and event.focal_mechanisms:
                        mechanism = event.focal_mechanisms[0]

                    mag = event.preferred_magnitude().mag if event.preferred_magnitude() else None
                    type = str(event.event_type) if event.event_type else "event"
                    starttime = event.origins[0].time - 5 * 60
                    endtime = event.origins[0].time + 1800
                    response = {
                        'eventId': eventId,
                        'latLng': {'lat':origin.latitude, 'lng':origin.longitude},
                        'startTime': starttime,
                        'endTime': endtime,
                        "mag": mag,
                        "icon": f"/static/jukbox/img/center.png"
                    }

                    self.eventsById[eventId] = response
            else:
                try:
                    eventCount = 0
                    for event in events:
                        eventId = random.randint(100000, 999999)
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

                        ballPath = f"./jukbox/static/jukbox/img/beachball{str(eventId)}.png"
                        newBall = beachball(components, size=50, facecolor=self.magToColor(event.preferred_magnitude().mag), outfile=ballPath)
                        matplotlib.pyplot.close(newBall)

                        mag = event.preferred_magnitude().mag if event.preferred_magnitude() else None
                        type = str(event.event_type) if event.event_type else "event"

                        iconPath = f"/static/jukbox/img/beachball{str(eventId)}.png"
                        icons.append("jukbox" + iconPath)
                        response = {
                            'eventId': eventId,
                            'latLng': {'lat':origin.latitude, 'lng':origin.longitude},
                            'startTime': event.origins[0].time - 5 * 60,
                            'endTime': event.origins[0].time + 1800,
                            "depth": origin.depth / 1000,
                            "mag": mag,
                            "type": type,
                            "icon": iconPath
                        }
                        eventCount += 1
                        self.eventsById[eventId] = response
                except Exception as e:
                    raise e
            try:
                self.scheduleFileDelete(icons)
            except Exception as e:
                print(f"Error scheduling file delete: {e}")

            retEvents = copy.deepcopy(self.eventsById)
            for id, ee in retEvents.items():
                ee['startTime'] = ee['startTime'].strftime('%Y-%m-%d %H:%M:%S')
                ee['endTime'] = ee['endTime'].strftime('%Y-%m-%d %H:%M:%S')

            ret = {
                'events': retEvents,
            }
            print(ret)
            return ret
        except Exception as e:
            print(f"Event search error: {e}")
            raise e



    def scheduleFileDelete(self, filePaths, hours=1):
        """Schedule the file deletion task to run after a given number of hours."""
        self.scheduler.add_job(self.deleteFiles, 'date', run_date=datetime.now() + timedelta(minutes=hours), args=[filePaths]) #fix this to be minutes

    def deleteFiles(self, filePaths):
        """Delete the specified files."""
        for filePath in filePaths:
            try:
                if os.path.exists(filePath):
                    os.remove(filePath)
            except Exception as e:
                print(f"Error deleting file {filePath}: {e}")

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


def getStationDistance(station, lat, long):
    if not station or not station.get('lat') or not station.get('lon'):
        return float('inf')

    lat1 = math.radians(station['lat'])
    lon1 = math.radians(station['lon'])
    lat2 = math.radians(lat)
    lon2 = math.radians(long)
    dlon = lon2 - lon1
    dlat = lat2 - lat1
    a = (math.sin(dlat / 2) ** 2 +
         math.cos(lat1) * math.cos(lat2) * math.sin(dlon / 2) ** 2)
    c = 2 * math.asin(math.sqrt(a))
    r = 6371.0
    return c * r


def formatWaveforms(stream):
    waveforms = []

    for trace in stream:
        time = trace.times()
        amplitude = trace.data

        waveform = {
            'time': time.tolist(),
            'amplitude': amplitude.tolist(),
            'station': trace.stats.station,
            'network': trace.stats.network,
            'starttime': trace.stats.starttime.isoformat(),
            'sampling_rate': trace.stats.sampling_rate
        }
        waveforms.append(waveform)

    return waveforms
