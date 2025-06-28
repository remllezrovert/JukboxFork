from io import StringIO
import os
from jukbox.Sample import Sample
import ast
import csv



def dictToString(d: dict) -> str:
    if not d:
        return "\"{}\""
    items = ", ".join(f"'{k}': '{v}'" for k, v in d.items())
    return f"\"{{{items}}}\""




def toCsvLine(sample: Sample) -> str:
    """
    Converts a Sample object to a CSV line.
    Args:
        sample (Sample): The Sample object to convert.`
        Returns:
        str: A string representing the Sample object in CSV format.
    """
    return str(sample.idNum) + "," + sample.name + "," + dictToString(sample.data) + "," + dictToString(sample.img) + "," + dictToString(sample.misc)


def fieldHandler(field):
    """
    Handles the conversion of a field from a CSV field to its appropriate type.
    Args:
        field (str): The field to convert.
        Returns:
        The converted field, which can be a string, int, float, list, dict, or None.
    """
    if not isinstance(field, str):
        return field

    field = field.strip()

    if field == "None":
        return None

    if field and field[0] in "[{(" and field[-1] in "]})":
        try:
            return ast.literal_eval(field)
        except (ValueError, SyntaxError):
            pass

    return field   
  



def rowToSample (row: list) -> Sample:
    """
    Converts a row list from a CSV file to a Sample object.
    Args:
        row (list): The row to convert.
    Returns:
        Sample: A Sample object created from the row.
    """
    fields = [fieldHandler(field) for field in row]
    idNum = int(fields[0])
    name = fields[1]
    try:
        sample = Sample(name)
    except FileExistsError:
        pass
    sample.idNum = idNum
    sample.data = fields[2]
    sample.img = fields[3]
    sample.misc = fields[4]
    return sample


def csvToSamples(fileName: str) -> list:
    samples = []
    try: 
        with open(fileName, 'r') as csvFile:
            reader = csv.reader(csvFile)
            for row in reader:
                samples.append(rowToSample(row))
            if (len(samples) == 0):
                return []
            print(samples)
            return samples
    except Exception as e:
        print(e)
        print(samples)
        return samples

def strToSample(csvString: str) -> Sample:
    """
    Converts a CSV string to a Sample object.
    Args:
        csvString (str): The CSV string to convert.
        Returns:
        Sample: A Sample object created from the CSV string.
        """
    reader = csv.reader(StringIO(csvString.strip()))
    row = next(reader)
    return rowToSample(row)


def csvCreate(sample: Sample, fileName: str) -> None:

    """
    Creates a new CSV file or appends to an existing one with the Sample data.
    Args:
        sample (Sample): The Sample object to write to the CSV file.
        fileName (str): Path to the CSV file.
    Raises:
        ValueError: If a sample with the same ID or name already exists in the CSV file.
    """
    with open(fileName, 'a', newline='') as csvFile:
        if csvReadById(fileName, sample.idNum):
            raise ValueError(f"Sample with id {sample.idNum} already exists.")
        if csvReadByName(fileName, sample.name):
            raise ValueError(f"Sample with name {sample.name} already exists.")
        csvFile.write(toCsvLine(sample))

def csvUpdate(sample: Sample, fileName: str) -> bool:
    """
    Creates the row if it did not allready exist.
    Updates a row in the CSV file corresponding to the given Sample's ID.

    If the file exists and a row with the same ID is found, it will be replaced
    with the updated sample. If no matching row is found, the sample
    will be appended to the CSV by calling csvCreate.

    Args:
        sample (Sample): The Sample object containing the updated data.
        fileName (str): Path to the CSV file.

    Returns:
        bool: 
            - True if the sample was found and updated.
            - False if the sample was not found and was appended instead.

    Raises:
        FileNotFoundError: If the specified CSV file does not exist.
    """ 
    found = False
    if not os.path.exists(fileName):
        csvCreate(sample, fileName)
        #raise FileNotFoundError(f"File {fileName} not found.")
    with open(fileName, 'r') as csvFile:
        reader = csv.reader(csvFile)
        rows = list(reader)

    with open(fileName, 'w', newline='') as csvFile:
        writer = csv.writer(csvFile)
        for row in rows:
            if int(row[0]) == sample.idNum:
                csvFile.write(toCsvLine(sample))  # Your original write
                found = True
            else:
                writer.writerow(row)

        if not found:
            csvFile.write(toCsvLine(sample))  # Moved inside the `with` block
            return False        
    return True
        

def csvReadFile(fileName: str) -> list:
    """
    Reads a CSV file and returns its content as a list of rows.
    Args:
        fileName (str): Path to the CSV file.
    Returns:
        list: A list of rows, where each row is a list of fields.
    Raises:
        FileNotFoundError: If the specified CSV file does not exist.
        """
    with open(fileName, 'r') as csvFile:
        reader = csv.reader(csvFile)
        data = []
        for row in reader:
            data.append(row)
    return data


def csvReadById(fileName: str, idNum: int) -> Sample:
    """
    Reads a CSV file and returns the Sample object corresponding to the given ID.
    Args:
        fileName (str): Path to the CSV file.
        idNum (int): The ID of the Sample to read.
    Returns:
        Sample: The Sample object corresponding to the given ID.
        None: If no Sample with the given ID is found.
    Raises:
        FileNotFoundError: If the specified CSV file does not exist.
        """
    with open(fileName, 'r') as csvFile:
        reader = csv.reader(csvFile)
        for row in reader:
            if int(row[0]) == idNum:
                return rowToSample(row)
    return None

def csvReadByName(fileName: str, name: str) -> Sample:    
    """
    Reads a CSV file and returns the Sample object corresponding to the given name.
    Args:
        fileName (str): Path to the CSV file.
        name (str): The name of the Sample to read.
    Returns:
        Sample: The Sample object corresponding to the given name.
        None: If no Sample with the given name is found.
    Raises:
        FileNotFoundError: If the specified CSV file does not exist.
        """
    with open(fileName, 'r') as csvFile:
        reader = csv.reader(csvFile)
        for row in reader:
            if row[1] == name:
                return rowToSample(row)
    return None


def csvDeleteById(fileName: str, idNum: int) -> None:
    """
    Deletes a row from the CSV file corresponding to the given ID.
    Args:
        fileName (str): Path to the CSV file.
        idNum (int): The ID of the Sample to delete.
    Raises:
        FileNotFoundError: If the specified CSV file does not exist.
    """
    with open(fileName, 'r') as csvFile:
        reader = csv.reader(csvFile)
        rows = list(reader)
    with open(fileName, 'w', newline='') as csvFile:
        writer = csv.writer(csvFile)
        for row in rows:
            if int(row[0]) != idNum:
                writer.writerow(row) 

def csvDeleteByName(fileName: str, name: str) -> None:
    """
    Deletes a row from the CSV file corresponding to the given name.
    Args:
        fileName (str): Path to the CSV file.
        name (str): The name of the Sample to delete.
    Raises:
        FileNotFoundError: If the specified CSV file does not exist.
    """
    with open(fileName, 'r') as csvFile:
        reader = csv.reader(csvFile)
        rows = list(reader)
    with open(fileName, 'w', newline='') as csvFile:
        writer = csv.writer(csvFile)
        for row in rows:
            if row[1] != name:
                writer.writerow(row)


#Find the next free spot for an ID          
def getNextID(fileName: str) -> int:
        usedIDs = set()

        #Check CSV Exists
        if not os.path.exists(fileName):
            return 0 #Starting ID for new file
        existingIDs = set()

        try:
        #Get all IDs from CSV
            with open(fileName, 'r') as csvFile:
                reader = csv.reader(csvFile)
                for row in reader:
                    if not row:
                        continue
                    try:
                        existingIDs.add(int(row[0]))
                    except (ValueError, IndexError):
                        continue #Skip invalid rows
        #Find next avaialble ID from 0
            nextID = 0
            while nextID in existingIDs:
                nextID += 1
            return nextID
        except Exception as e:
            raise IOError(f"Failed to find next ID: {str(e)}")

    