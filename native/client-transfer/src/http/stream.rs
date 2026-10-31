//! Bounded HTTP chunks feed a blocking tar reader without retaining a second archive buffer.
use super::{Cancellation, ObjectItem, Response, network_error};
use crate::{invalid, tar};
use futures_util::StreamExt;
use std::io::{self, Read};
use tokio::sync::mpsc;

pub(super) async fn read(
    response: Response,
    maximum: usize,
    cancellation: &Cancellation,
) -> io::Result<Vec<ObjectItem>> {
    if maximum == 0 || maximum > tar::MAX_ARCHIVE_BYTES {
        return Err(invalid("remote fetch archive exceeds bounds"));
    }
    let (sender, receiver) = mpsc::channel(2);
    let parser = tokio::task::spawn_blocking(move || {
        tar::read_from(Chunks { receiver, current: io::Cursor::new(Vec::new()) }, maximum)
    });
    let result = feed(response, maximum, cancellation, &sender).await;
    drop(sender);
    let parsed = parser.await.map_err(io::Error::other)?;
    result?;
    parsed
}
async fn feed(
    response: Response,
    maximum: usize,
    cancellation: &Cancellation,
    sender: &mpsc::Sender<Vec<u8>>,
) -> io::Result<()> {
    let mut stream = response.bytes_stream();
    let mut count = 0usize;
    while let Some(chunk) = cancellation.run(stream.next()).await? {
        let chunk = chunk.map_err(|error| network_error(&error))?;
        if chunk.len() > maximum.saturating_sub(count) {
            return Err(invalid("remote fetch archive exceeds bounds"));
        }
        count += chunk.len();
        if !chunk.is_empty() && !sender.is_closed() {
            let _ = cancellation.run(sender.send(chunk.to_vec())).await?;
        }
    }
    Ok(())
}
struct Chunks {
    receiver: mpsc::Receiver<Vec<u8>>,
    current: io::Cursor<Vec<u8>>,
}
impl Read for Chunks {
    fn read(&mut self, output: &mut [u8]) -> io::Result<usize> {
        if output.is_empty() {
            return Ok(0);
        }
        loop {
            let count = self.current.read(output)?;
            if count > 0 {
                return Ok(count);
            }
            match self.receiver.blocking_recv() {
                Some(chunk) if chunk.is_empty() => continue,
                Some(chunk) => self.current = io::Cursor::new(chunk),
                None => return Ok(0),
            }
        }
    }
}
