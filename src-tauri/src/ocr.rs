// OCR for board images via macOS Vision (ScreenFloat's killer feature,
// available on EVERY image here — not just fresh captures).
// Vision is thread-safe off-main; the command runs it in a blocking task.

#[cfg(target_os = "macos")]
pub fn recognize(bytes: &[u8]) -> Result<String, String> {
    use objc2::AnyThread;
    use objc2_core_foundation::CFData;
    use objc2_foundation::{NSArray, NSDictionary};
    use objc2_image_io::CGImageSource;
    use objc2_vision::{
        VNImageRequestHandler, VNRecognizeTextRequest, VNRequest, VNRequestTextRecognitionLevel,
    };

    objc2::rc::autoreleasepool(|_| unsafe {
        let data = CFData::from_bytes(bytes);
        let source = CGImageSource::with_data(&data, None).ok_or("cannot decode image")?;
        let cg = source
            .image_at_index(0, None)
            .ok_or("cannot create image for OCR")?;

        let empty = NSDictionary::<objc2_foundation::NSString, objc2::runtime::AnyObject>::new();
        let handler = VNImageRequestHandler::initWithCGImage_options(
            VNImageRequestHandler::alloc(),
            &cg,
            &empty,
        );
        let request = VNRecognizeTextRequest::new();
        request.setRecognitionLevel(VNRequestTextRecognitionLevel::Accurate);
        request.setUsesLanguageCorrection(true);

        let typed = request.clone();
        let upcast: objc2::rc::Retained<VNRequest> = request.into_super().into_super();
        let requests = NSArray::from_slice(&[&*upcast]);
        handler
            .performRequests_error(&requests)
            .map_err(|e| e.localizedDescription().to_string())?;

        let mut lines = Vec::new();
        if let Some(results) = typed.results() {
            for obs in results.iter() {
                let candidates = obs.topCandidates(1);
                if let Some(best) = candidates.firstObject() {
                    lines.push(best.string().to_string());
                }
            }
        }
        Ok(lines.join("\n"))
    })
}

#[cfg(not(target_os = "macos"))]
pub fn recognize(_bytes: &[u8]) -> Result<String, String> {
    // shortcut: Windows.Media.Ocr / Tesseract are the upgrade paths for other platforms
    Err("OCR currently requires macOS (Vision framework)".into())
}

#[cfg(test)]
mod tests {
    #[test]
    fn invalid_bytes_fail_gracefully() {
        let r = super::recognize(b"not an image");
        #[cfg(target_os = "macos")]
        assert!(r.is_err());
        #[cfg(not(target_os = "macos"))]
        assert!(r.is_err());
    }
}