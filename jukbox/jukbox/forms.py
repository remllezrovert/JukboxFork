from django import forms


from django import forms

class FileUploadForm(forms.Form):
    image = forms.ImageField()
    file = forms.FileField(required=False)

