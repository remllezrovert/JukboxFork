from email.mime import image
from typing import IO, List, Optional
import random
import os
import shutil

class Sample:
    def __init__(self, name: str,**kwargs):
        """
        Initializes a Sample object.
        Creates a directory structure for the sample, including subdirectories for images and data.
        The sample name is used to create the directory structure.
        Args:
            name (str): The name of the sample.
            **kwargs: Additional keyword arguments to set as attributes.
        Kwargs:
            idNum (int): An optional ID number for the sample. If not provided, a random number is generated.
            img (dict): A dictionary to store image file paths.
            data (dict): A dictionary to store data file paths.
            misc (dict): A dictionary for miscellaneous attributes.
            idNum (int): A unique ID number for the sample.
        Raises:
            FileExistsError: If a sample with the same name already exists.
            OSError: If there is an error creating the directory structure.
        """
        self.img = {}
        self.data = {}
        self.misc = {}
        self.idNum = random.randrange(1000000,2000000)
        for k,v in kwargs.items():
            setattr(self, k, v)
        if name == None:
            self.name = idNum
        else:
            self.name = name
        try:
            os.makedirs("Samples/" + name + "/img")
            os.mkdir("Samples/" + name + "/data")
        except(FileExistsError, OSError):
            print("Sample with that name already exists.")

    
    def delete(self):
        """
        Deletes the sample directory and all its contents.
        """
        shutil.rmtree("Samples/" + self.name)
        del self

    ##optional data stream
    def addImg(self, imgName: str, imgKey: str, imgFile: Optional[IO] = None) -> bool:
        """
        Adds an image to the sample. Optional imgFile parameter
        Notice, imgName is the name of the image file, not the path.

        Example of usage with the optional param:
            sample = Sample("Sample1")
            with open("path/to/image.jpg", "rb") as imgFile:
                sample.addImg("image.jpg", "imgKey", imgFile)
        
        Args:
            imgName (str): The name of the image file. Not the path
            imgKey (str): The key to store the image in the img dictionary.
            imgFile (IO, optional): A file-like object containing the image data. Defaults to None.
        Returns:
            bool: True if the image was added successfully, False otherwise.
            """
        imgName = "Samples/" + self.name + "/img/" + imgName
        if os.path.exists(imgName):
            raise FileExistsError("Image with that name already exists on disk.")
        if self.img.get(imgKey) is not None:
            raise KeyError("Image with that key already exists in the img dictionary.")
        if imgFile:
            try:
                with open(imgName, 'wb') as f:
                    f.write(imgFile.read())
            except Exception as e:
                raise IOError(f"Failed to save image: {e}")
        
        self.img[imgKey] = imgName
        return True
    
    def addData(self, dataName: str, dataKey: str, dataFile: Optional[IO] = None) -> bool:
        """
        Adds data to the sample. Optional dataFile parameter
        Notice, dataName is the name of the data file, not the path.
        Example of usage with the optional param:
            sample = Sample("Sample1")
            with open("path/to/data.txt", "rb") as dataFile:
                sample.addData("data.txt", "dataKey", dataFile)
        Args:
            dataName (str): The name of the data file. Not the path
            dataKey (str): The key to store the data in the data dictionary.
            dataFile (IO, optional): A file-like object containing the data. Defaults to None.
        Returns:
            bool: True if the data was added successfully, False otherwise.
        """
        dataName = "Samples/" + self.name + "/data/" + dataName
        if os.path.exists(dataName):
            raise FileExistsError("Data with that name already exists on disk.")
        if self.data.get(dataKey) is not None:
            raise KeyError("Data with that key already exists in the img dictionary.")
        if dataFile:
            try:
                with open(dataName, 'wb') as f:
                    f.write(dataFile.read())
            except Exception as e:
                raise IOError(f"Failed to save image: {e}")
        self.data[dataKey] = dataName
        return True
    
    def removeData(self, dataKey: str) -> bool:
        """
        Removes data from the sample.
        Args:
            dataKey (str): The key of the data to remove.
        Returns:
            bool: True if the data was removed successfully, False otherwise.
        """
        if dataKey not in self.data:
            return False
        os.remove(self.data[dataKey])
        del self.data[dataKey]
        return True
    
    def removeImg(self, imgKey: str) -> bool:
        """
        Removes an image from the sample.
        Args:
            imgKey (str): The key of the image to remove.
        Returns:
            bool: True if the image was removed successfully, False otherwise.
        """
        if imgKey not in self.img:
            return False
        os.remove(self.img[imgKey])
        del self.img[imgKey]
        return True
   
    
    def renameImg(self, imgKey: str, newName: str) -> bool:
        """
        Renames an image in the sample.
        Args:
            imgKey (str): The key of the image to rename.
            newName (str): The new name for the image.
        Returns:
            bool: True if the image was renamed successfully, False otherwise.
        """
        if imgKey not in self.img:
            return False
        newPath = "Samples/" + self.name + "/img/" + newName
        if os.path.exists(newPath):
            raise FileExistsError("Image with that name already exists on disk.")
        os.rename(self.img[imgKey], newPath)
        self.img[imgKey] = newPath
        return True      

    def renameData(self, dataKey: str, newName: str) -> bool:
        """
        Renames data in the sample.
        Args:
            dataKey (str): The key of the data to rename.
            newName (str): The new name for the data.
        Returns:
            bool: True if the data was renamed successfully, False otherwise.
        """
        if dataKey not in self.data:
            return False

        newPath = "Samples/" + self.name + "/data/" + newName
        if os.path.exists(newPath):
            raise FileExistsError("Data with that name already exists on disk.")
        os.rename(self.data[dataKey], newPath)
        self.data[dataKey] = newPath
        return True

        
    def __str__(self) -> str:
        return (self.name + "," + str(self.idNum))

    def __repr__(self) -> str:
        return (self.name + "," + str(self.idNum))


    def SearchImgByKey(self, key: str) -> List:
        images = []
        for k in self.img.keys():
            if key in k:
                images.append(self.img[k])
        if images.__len__() == 0:
            return None
        return images

    def SearchDataByKey(self, key:str) -> List:
        data = []
        for k in self.data.keys():
            if key in k:
                data.append(self.data[k])
        if data.__len__() == 0:
            return None
        return data



    def rename(self,sampleName: str) -> bool:
        """
        Renames the sample.
        Args:
            sampleName (str): The new name for the sample.
        Returns:
            bool: True if the sample was renamed successfully, False otherwise.
        """
        if os.path.exists("Samples/" + sampleName):
            print("Sample with that name already exists.")
            return False
        else:
            os.rename("Samples/" + self.name, "Samples/" + sampleName)
            self.name = sampleName
            return True
    
