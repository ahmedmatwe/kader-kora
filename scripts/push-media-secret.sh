#!/bin/zsh
# بيحط مفتاح GitHub بتاعك كـsecret اسمه MEDIA_TOKEN عشان السحابة ترفع فيديو إنستجرام للريبو العام kader-kora-media.
gh auth token | gh secret set MEDIA_TOKEN -R ahmedmatwe/kader-kora && echo "✓ MEDIA_TOKEN اتحط"
